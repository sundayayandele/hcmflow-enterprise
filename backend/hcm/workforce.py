from datetime import date
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
def employees(p=Depends(principal), db=Depends(database)):
    require(p, "admin", "hr", "payroll", "approver", "auditor", "employee")
    q = select(Employee).where(Employee.tenant_id == p["tenant_id"])
    if not set(p["roles"]).intersection(
        {"admin", "hr", "payroll", "approver", "auditor"}
    ):
        q = q.where(Employee.id == p.get("employee_id"))
    return [view(e) for e in db.scalars(q.order_by(Employee.employee_code)).all()]


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
