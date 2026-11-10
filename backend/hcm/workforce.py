from datetime import date, datetime
from zoneinfo import ZoneInfo
import json
import os
from decimal import Decimal
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import String, JSON, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column
from hcm.common import (
    Base,
    TenantRow,
    application,
    principal,
    database,
    require,
    owned,
    audit,
    fingerprint,
)
from hcm.intake import parse, MAX_BYTES

cipher = Fernet(os.environ["PII_KEY"].encode())


def business_date():
    return datetime.now(
        ZoneInfo(os.environ.get("BUSINESS_TIMEZONE", "Africa/Lagos"))
    ).date()


class Employee(TenantRow, Base):
    __tablename__ = "employees"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_code"),)
    employee_code: Mapped[str] = mapped_column(String(50))
    private_data: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String(20))
    effective_from: Mapped[str] = mapped_column(String(10))
    version: Mapped[int] = mapped_column(default=1)


class ImportBatch(TenantRow, Base):
    __tablename__ = "imports"
    digest: Mapped[str] = mapped_column(String(64))
    encrypted_rows: Mapped[str] = mapped_column(String)
    errors: Mapped[list] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(20), default="preview")
    __table_args__ = (UniqueConstraint("tenant_id", "digest"),)


class EmployeeInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    employee_code: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    full_name: str = Field(min_length=2, max_length=150)
    department: str = Field(min_length=1, max_length=100)
    email: str = Field(
        min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )
    monthly_gross: Decimal = Field(ge=0, le=1000000000, max_digits=13, decimal_places=2)
    effective_from: date


def encrypt(data):
    return cipher.encrypt(json.dumps(data).encode()).decode()


def decrypt(value):
    return json.loads(cipher.decrypt(value.encode()))


def view(e):
    return dict(id=e.id, source=e.source, version=e.version, **decrypt(e.private_data))


app = application("HCMFlow Workforce & Intake")


@app.get("/employees")
def employees(
    as_of: date | None = None,
    period_end: date | None = None,
    p=Depends(principal),
    db=Depends(database),
):
    require(p, "admin", "hr", "payroll", "approver", "auditor", "employee")
    q = select(Employee).where(Employee.tenant_id == p["tenant_id"])
    if not set(p["roles"]).intersection(
        {"admin", "hr", "payroll", "approver", "auditor"}
    ):
        q = q.where(Employee.id == p.get("employee_id"))
    day = (as_of or business_date()).isoformat()
    result = []
    for e in db.scalars(q.order_by(Employee.employee_code)).all():
        if e.effective_from > day:
            continue
        data = versioned_view(db, e, day)
        data["changes_in_period"] = bool(
            period_end
            and db.scalar(
                select(EmployeeRevision.id).where(
                    EmployeeRevision.tenant_id == p["tenant_id"],
                    EmployeeRevision.employee_id == e.id,
                    EmployeeRevision.effective_from > day,
                    EmployeeRevision.effective_from <= period_end.isoformat(),
                )
            )
        )
        result.append(data)
    return result


@app.post("/employees", status_code=201)
def create(
    data: EmployeeInput, request: Request, p=Depends(principal), db=Depends(database)
):
    require(p, "admin", "hr")
    if db.scalar(
        select(Employee).where(
            Employee.tenant_id == p["tenant_id"],
            Employee.employee_code == data.employee_code,
        )
    ):
        raise HTTPException(
            409, "Employee code already exists; source changes require reconciliation"
        )
    e = Employee(
        tenant_id=p["tenant_id"],
        employee_code=data.employee_code,
        private_data=encrypt(data.model_dump(mode="json")),
        source="core_hr",
        effective_from=data.effective_from.isoformat(),
    )
    db.add(e)
    db.flush()
    audit(db, p, "employee.created", e.id, request, source="core_hr", version=1)
    return view(e)


@app.post("/imports/preview")
async def preview(
    file: UploadFile, request: Request, p=Depends(principal), db=Depends(database)
):
    require(p, "admin", "hr")
    rows = parse(file.filename or "", await file.read(MAX_BYTES + 1))
    digest = fingerprint(rows)
    existing = db.scalar(
        select(ImportBatch).where(
            ImportBatch.tenant_id == p["tenant_id"], ImportBatch.digest == digest
        )
    )
    if existing:
        return {
            "id": existing.id,
            "errors": existing.errors,
            "state": existing.state,
            "count": len(rows),
        }
    errors = []
    clean = []
    codes = set()
    for i, row in enumerate(rows, 2):
        try:
            record = EmployeeInput.model_validate(row).model_dump(mode="json")
            code = record["employee_code"]
            if code in codes or db.scalar(
                select(Employee).where(
                    Employee.tenant_id == p["tenant_id"], Employee.employee_code == code
                )
            ):
                errors.append(
                    {
                        "row": i,
                        "field": "employee_code",
                        "reason": "Duplicate or existing code; updates require reconciliation",
                    }
                )
            codes.add(code)
            clean.append(record)
        except ValidationError as exc:
            for error in exc.errors():
                errors.append(
                    {
                        "row": i,
                        "field": ".".join(map(str, error["loc"])),
                        "reason": error["type"],
                    }
                )
    batch = ImportBatch(
        tenant_id=p["tenant_id"],
        digest=digest,
        encrypted_rows=encrypt(clean),
        errors=errors,
    )
    db.add(batch)
    db.flush()
    audit(
        db,
        p,
        "import.previewed",
        batch.id,
        request,
        count=len(rows),
        error_count=len(errors),
    )
    return {"id": batch.id, "errors": errors, "state": batch.state, "count": len(rows)}


@app.post("/imports/{id}/commit")
def commit(id: str, request: Request, p=Depends(principal), db=Depends(database)):
    require(p, "admin", "hr")
    batch = owned(db, ImportBatch, id, p, True)
    if batch.state == "committed":
        return {"state": "committed", "id": batch.id}
    if batch.errors:
        raise HTTPException(409, "Resolve all validation errors before committing")
    records = decrypt(batch.encrypted_rows)
    for row in records:
        if db.scalar(
            select(Employee).where(
                Employee.tenant_id == p["tenant_id"],
                Employee.employee_code == row["employee_code"],
            )
        ):
            raise HTTPException(
                409, "Employee code changed after preview; revalidate import"
            )
        db.add(
            Employee(
                tenant_id=p["tenant_id"],
                employee_code=row["employee_code"],
                private_data=encrypt(row),
                source="import",
                effective_from=row["effective_from"],
            )
        )
    batch.state = "committed"
    audit(db, p, "import.committed", batch.id, request, count=len(records))
    return {"state": "committed", "id": batch.id}


class EmployeeRevision(TenantRow, Base):
    __tablename__ = "employee_revisions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", "version"),
        UniqueConstraint("tenant_id", "employee_id", "effective_from"),
    )
    employee_id: Mapped[str] = mapped_column(String(36), index=True)
    effective_from: Mapped[str] = mapped_column(String(10))
    version: Mapped[int]
    private_data: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String(36))


class Amendment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=300)
    record: EmployeeInput


def versioned_view(db, e, day):
    selected = db.scalar(
        select(EmployeeRevision)
        .where(
            EmployeeRevision.tenant_id == e.tenant_id,
            EmployeeRevision.employee_id == e.id,
            EmployeeRevision.effective_from <= day,
        )
        .order_by(EmployeeRevision.effective_from.desc())
    )
    if selected:
        return dict(
            id=e.id,
            source=e.source,
            version=e.version,
            record_version=selected.version,
            **decrypt(selected.private_data),
        )
    return dict(
        id=e.id,
        source=e.source,
        version=e.version,
        record_version=1,
        **decrypt(e.private_data),
    )


@app.post("/employees/{id}/amend")
def amend(
    id: str,
    data: Amendment,
    request: Request,
    p=Depends(principal),
    db=Depends(database),
):
    require(p, "admin", "hr")
    e = owned(db, Employee, id, p, True)
    if e.source != "core_hr":
        raise HTTPException(
            409,
            "Imported employee updates require source reconciliation; no source override is permitted",
        )
    if e.version != data.expected_version:
        raise HTTPException(409, "Employee changed; refresh and retry")
    if data.record.employee_code != e.employee_code:
        raise HTTPException(422, "Employee code is immutable")
    if data.record.effective_from.isoformat() <= e.effective_from:
        raise HTTPException(422, "Amendments must follow the original effective date")
    e.version += 1
    revision = EmployeeRevision(
        tenant_id=p["tenant_id"],
        employee_id=id,
        effective_from=data.record.effective_from.isoformat(),
        version=e.version,
        private_data=encrypt(data.record.model_dump(mode="json")),
        reason=cipher.encrypt(data.reason.encode()).decode(),
        actor=p["sub"],
    )
    db.add(revision)
    db.flush()
    audit(
        db,
        p,
        "employee.amended",
        id,
        request,
        version=e.version,
        effective_from=revision.effective_from,
    )
    return versioned_view(db, e, business_date().isoformat())


@app.get("/employees/{id}/history")
def history(id: str, request: Request, p=Depends(principal), db=Depends(database)):
    require(p, "admin", "hr", "payroll", "auditor")
    e = owned(db, Employee, id, p)
    rows = db.scalars(
        select(EmployeeRevision)
        .where(
            EmployeeRevision.tenant_id == p["tenant_id"],
            EmployeeRevision.employee_id == id,
        )
        .order_by(EmployeeRevision.effective_from)
    ).all()
    audit(db, p, "employee.history_viewed", id, request)
    return {
        "employee_id": id,
        "source": e.source,
        "version": e.version,
        "records": [
            {
                "record_version": 1,
                "reason": "Initial record",
                "record": decrypt(e.private_data),
            }
        ]
        + [
            {
                "record_version": r.version,
                "reason": cipher.decrypt(r.reason.encode()).decode(),
                "actor": r.actor,
                "record": decrypt(r.private_data),
            }
            for r in rows
        ],
    }


@app.get("/employees/lookup")
def lookup(p=Depends(principal), db=Depends(database)):
    require(
        p,
        "admin",
        "hr",
        "payroll",
        "approver",
        "auditor",
        "employee",
        "finance",
        "recruiter",
        "talent",
    )
    q = select(Employee).where(Employee.tenant_id == p["tenant_id"])
    if not set(p["roles"]) & {
        "admin",
        "hr",
        "payroll",
        "approver",
        "auditor",
        "finance",
        "recruiter",
        "talent",
    }:
        q = q.where(Employee.id == p.get("employee_id", ""))
    return [
        {
            "id": e.id,
            "employee_code": e.employee_code,
            "full_name": versioned_view(db, e, business_date().isoformat())[
                "full_name"
            ],
        }
        for e in db.scalars(q)
    ]
