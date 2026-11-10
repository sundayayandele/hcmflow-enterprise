"""Workplace service. Separate domain schemas share a small, tenant-isolated pilot deployment."""

import json
import os
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal
import httpx
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request
from pydantic import Field, ValidationError
from sqlalchemy import String, DateTime, UniqueConstraint, select
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
from hcm.workplace_domain import (
    Input,
    SCHEMAS,
    READERS,
    CREATORS,
    SELF_CREATE,
    SELF_READ,
    TRANSITIONS,
    INITIAL,
    staffing_projection,
)

cipher = Fernet(os.environ["PII_KEY"].encode())


def encrypt(data):
    return cipher.encrypt(json.dumps(data).encode()).decode()


def decrypt(value):
    return json.loads(cipher.decrypt(value.encode()))


class WorkItem(TenantRow, Base):
    __tablename__ = "work_items"
    __table_args__ = (UniqueConstraint("tenant_id", "request_key"),)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    state: Mapped[str] = mapped_column(String(30))
    subject_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    creator_id: Mapped[str] = mapped_column(String(36))
    last_actor: Mapped[str] = mapped_column(String(36))
    payload: Mapped[str] = mapped_column(String)
    request_key: Mapped[str] = mapped_column(String(80))
    request_hash: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class LeaveBalance(TenantRow, Base):
    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_id", "year"),)
    employee_id: Mapped[str] = mapped_column(String(36))
    year: Mapped[int]
    allowance: Mapped[int]
    used: Mapped[int] = mapped_column(default=0)


class Plan(TenantRow, Base):
    __tablename__ = "staffing_plans"
    creator_id: Mapped[str] = mapped_column(String(36))
    payload: Mapped[str] = mapped_column(String)


class CreateItem(Input):
    kind: str
    data: dict
    request_key: str = Field(min_length=8, max_length=80)


class Decision(Input):
    expected_version: int = Field(ge=1)
    state: str
    note: str = Field(min_length=3, max_length=500)


class TaskDecision(Input):
    expected_version: int = Field(ge=1)
    index: int = Field(ge=0)
    completed: bool


class BalanceInput(Input):
    employee_id: str
    year: int = Field(ge=2020, le=2100)
    allowance: int = Field(ge=0, le=366)


class PlanInput(Input):
    title: str = Field(min_length=3, max_length=120)
    base_headcount: int = Field(ge=0, le=100000)
    hires: int = Field(ge=0, le=100000)
    exits: int = Field(ge=0, le=100000)
    monthly_cost_per_employee: Decimal = Field(
        ge=0, le=100000000, max_digits=12, decimal_places=2
    )


app = application("HCMFlow Workplace: Operations, Talent & Employee Finance")


def privileged(p, kind):
    return bool(set(p["roles"]) & READERS[kind])


def visible(row, p):
    return privileged(p, row.kind) or (
        row.kind in SELF_READ
        and row.subject_id is not None
        and row.subject_id == p.get("employee_id")
    )


def item(db, id, p):
    row = owned(db, WorkItem, id, p, True)
    if not visible(row, p):
        raise HTTPException(404, "Record not found")
    return row


def view(row):
    data = decrypt(row.payload)
    return {
        "id": row.id,
        "kind": row.kind,
        "state": row.state,
        "employee_id": row.subject_id,
        "creator_id": row.creator_id,
        "version": row.version,
        "created_at": row.created_at,
        "data": data,
    }


def workforce(request, path="/employees/lookup"):
    try:
        r = httpx.get(
            os.environ.get("WORKFORCE_URL", "http://workforce:8000") + path,
            headers={"Authorization": request.headers["authorization"]},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Authorized workforce lookup unavailable")


def validate_subject(employee_id, request, p):
    if not any(e["id"] == employee_id for e in workforce(request)):
        raise HTTPException(422, "Employee is not in the authorized workforce")


def balance(db, p, employee_id, year):
    return db.scalar(
        select(LeaveBalance)
        .where(
            LeaveBalance.tenant_id == p["tenant_id"],
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.year == year,
        )
        .with_for_update()
    )


@app.get("/items")
def items(kind: str | None = None, p=Depends(principal), db=Depends(database)):
    if kind is not None and kind not in SCHEMAS:
        raise HTTPException(422, "Unknown workflow kind")
    rows = db.scalars(
        select(WorkItem)
        .where(WorkItem.tenant_id == p["tenant_id"])
        .order_by(WorkItem.created_at.desc())
        .limit(1000)
    ).all()
    return [view(r) for r in rows if (kind is None or r.kind == kind) and visible(r, p)]


@app.post("/items", status_code=201)
def create(
    data: CreateItem, request: Request, p=Depends(principal), db=Depends(database)
):
    if data.kind not in SCHEMAS:
        raise HTTPException(422, "Unknown workflow kind")
    can_create = bool(set(p["roles"]) & CREATORS[data.kind])
    if not can_create and not (data.kind in SELF_CREATE and p.get("employee_id")):
        raise HTTPException(403, "Permission denied")
    try:
        payload = SCHEMAS[data.kind].model_validate(data.data).model_dump(mode="json")
    except ValidationError:
        raise HTTPException(422, "Invalid workflow fields, dates or amounts")
    subject = payload.get("employee_id")
    if not can_create and subject != p.get("employee_id"):
        raise HTTPException(403, "Only your own employee record is permitted")
    digest = fingerprint({"actor": p["sub"], "kind": data.kind, "data": payload})
    existing = db.scalar(
        select(WorkItem).where(
            WorkItem.tenant_id == p["tenant_id"],
            WorkItem.request_key == data.request_key,
        )
    )
    if existing:
        if existing.request_hash != digest:
            raise HTTPException(409, "Request key already used for different inputs")
        return view(existing)
    if subject:
        validate_subject(subject, request, p)
    if data.kind == "leave":
        b = balance(db, p, subject, date.fromisoformat(payload["start"]).year)
        if b is None:
            raise HTTPException(
                409, "Configure a calendar-day leave balance before requesting leave"
            )
        days = (
            date.fromisoformat(payload["end"]) - date.fromisoformat(payload["start"])
        ).days + 1
        if b.used + days > b.allowance:
            raise HTTPException(409, "Insufficient calendar-day leave balance")
        for r in db.scalars(
            select(WorkItem).where(
                WorkItem.tenant_id == p["tenant_id"],
                WorkItem.kind == "leave",
                WorkItem.subject_id == subject,
                WorkItem.state.in_(["submitted", "approved"]),
            )
        ):
            old = decrypt(r.payload)
            if payload["start"] <= old["end"] and old["start"] <= payload["end"]:
                raise HTTPException(409, "Leave dates overlap an existing request")
        payload["days"] = days
        payload["basis"] = "calendar_days"
    if data.kind in ("onboarding", "exit"):
        payload["completed_tasks"] = []
    payload["decisions"] = []
    row = WorkItem(
        tenant_id=p["tenant_id"],
        kind=data.kind,
        state=INITIAL.get(data.kind, "submitted"),
        subject_id=subject,
        creator_id=p["sub"],
        last_actor=p["sub"],
        payload=encrypt(payload),
        request_key=data.request_key,
        request_hash=digest,
    )
    db.add(row)
    db.flush()
    audit(db, p, "workplace.created", row.id, request, kind=row.kind)
    return view(row)


@app.post("/items/{id}/transition")
def transition(
    id: str,
    data: Decision,
    request: Request,
    p=Depends(principal),
    db=Depends(database),
):
    row = item(db, id, p)
    if row.version != data.expected_version:
        raise HTTPException(409, "Record changed; refresh before deciding")
    if data.state not in TRANSITIONS[row.kind].get(row.state, []):
        raise HTTPException(409, "Transition is not allowed")
    own = row.subject_id is not None and row.subject_id == p.get("employee_id")
    self_action = (row.kind == "goal" and own) or (
        row.kind == "learning" and own and data.state == "completion_requested"
    )
    if not privileged(p, row.kind) and not self_action:
        raise HTTPException(403, "Permission denied")
    if row.kind in ("leave", "time", "expense", "benefit", "disciplinary") and (
        p["sub"] == row.creator_id or own
    ):
        raise HTTPException(
            403, "Independent review required; cannot decide your own request"
        )
    if (
        row.kind == "learning"
        and data.state == "verified"
        and p["sub"] == row.last_actor
    ):
        raise HTTPException(403, "Completion must be verified by a different reviewer")
    payload = decrypt(row.payload)
    if (
        row.kind in ("onboarding", "exit")
        and data.state == "completed"
        and len(payload["completed_tasks"]) != len(payload["tasks"])
    ):
        raise HTTPException(409, "Complete all checklist tasks first")
    if row.kind == "leave" and data.state == "approved":
        b = balance(db, p, row.subject_id, date.fromisoformat(payload["start"]).year)
        if b is None or b.used + payload["days"] > b.allowance:
            raise HTTPException(409, "Insufficient calendar-day leave balance")
        b.used += payload["days"]
    payload["decisions"].append(
        {
            "actor": p["sub"],
            "from": row.state,
            "to": data.state,
            "note": data.note,
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
    row.state = data.state
    row.version += 1
    row.last_actor = p["sub"]
    row.payload = encrypt(payload)
    audit(
        db,
        p,
        "workplace.transitioned",
        id,
        request,
        kind=row.kind,
        state=row.state,
        version=row.version,
    )
    return view(row)


@app.post("/items/{id}/tasks")
def tasks(
    id: str,
    data: TaskDecision,
    request: Request,
    p=Depends(principal),
    db=Depends(database),
):
    row = item(db, id, p)
    if row.kind not in ("onboarding", "exit") or not privileged(p, row.kind):
        raise HTTPException(403, "HR checklist access required")
    if row.version != data.expected_version or row.state not in ("open", "in_progress"):
        raise HTTPException(409, "Checklist changed or is closed")
    payload = decrypt(row.payload)
    if data.index >= len(payload["tasks"]):
        raise HTTPException(422, "Task index out of range")
    done = set(payload["completed_tasks"])
    if data.completed:
        done.add(data.index)
    else:
        done.discard(data.index)
    payload["completed_tasks"] = sorted(done)
    row.payload = encrypt(payload)
    row.version += 1
    audit(
        db,
        p,
        "checklist.task_changed",
        id,
        request,
        index=data.index,
        completed=data.completed,
        version=row.version,
    )
    return view(row)


@app.get("/leave-balances")
def balances(p=Depends(principal), db=Depends(database)):
    q = select(LeaveBalance).where(LeaveBalance.tenant_id == p["tenant_id"])
    if not set(p["roles"]) & {"admin", "hr", "approver"}:
        q = q.where(LeaveBalance.employee_id == p.get("employee_id", ""))
    return [
        {
            "id": b.id,
            "employee_id": b.employee_id,
            "year": b.year,
            "allowance": b.allowance,
            "used": b.used,
            "available": b.allowance - b.used,
            "basis": "calendar_days",
        }
        for b in db.scalars(q)
    ]


@app.post("/leave-balances")
def allocate(
    data: BalanceInput, request: Request, p=Depends(principal), db=Depends(database)
):
    require(p, "admin", "hr")
    validate_subject(data.employee_id, request, p)
    b = balance(db, p, data.employee_id, data.year)
    if b is None:
        b = LeaveBalance(tenant_id=p["tenant_id"], **data.model_dump(), used=0)
        db.add(b)
    else:
        if data.allowance < b.used:
            raise HTTPException(409, "Allowance cannot be below used days")
        b.allowance = data.allowance
    db.flush()
    audit(
        db, p, "leave.allowance_set", b.id, request, year=b.year, allowance=b.allowance
    )
    return {
        "id": b.id,
        "allowance": b.allowance,
        "used": b.used,
        "basis": "calendar_days",
    }


@app.get("/access-policy")
def policy(p=Depends(principal)):
    require(p, "admin", "hr", "auditor")
    return {
        "scope": "tenant + employee ownership",
        "workflow_readers": {k: sorted(v) for k, v in READERS.items()},
        "self_service": sorted(SELF_READ),
        "independent_review": [
            "leave",
            "time",
            "expense",
            "benefit",
            "disciplinary",
            "learning verification",
        ],
        "production_gates": [
            "OIDC/MFA",
            "team/entity grants",
            "statutory validation",
            "provider acceptance",
            "off-site restore",
        ],
    }


@app.get("/insights")
def insights(p=Depends(principal), db=Depends(database)):
    require(p, "admin", "hr", "finance", "auditor", "talent", "recruiter")
    rows = db.scalars(
        select(WorkItem).where(WorkItem.tenant_id == p["tenant_id"])
    ).all()
    allowed = [r for r in rows if privileged(p, r.kind)]
    counts = Counter((r.kind, r.state) for r in allowed)
    approved_expenses = sum(
        (
            Decimal(decrypt(r.payload)["amount"])
            for r in allowed
            if r.kind == "expense" and r.state == "approved"
        ),
        Decimal(0),
    )
    return {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "source": "live operational records; not a historical warehouse",
        "counts": [
            {"kind": k, "state": s, "count": n} for (k, s), n in sorted(counts.items())
        ],
        "approved_expenses_NGN": str(approved_expenses.quantize(Decimal("0.01"))),
        "coverage": "Only workflow categories permitted by your roles",
    }


@app.get("/plans")
def plans(p=Depends(principal), db=Depends(database)):
    require(p, "admin", "hr", "finance", "auditor")
    return [
        {"id": r.id, **decrypt(r.payload)}
        for r in db.scalars(select(Plan).where(Plan.tenant_id == p["tenant_id"]))
    ]


@app.post("/plans", status_code=201)
def plan(data: PlanInput, request: Request, p=Depends(principal), db=Depends(database)):
    require(p, "admin", "hr", "finance")
    try:
        result = staffing_projection(
            data.base_headcount, data.hires, data.exits, data.monthly_cost_per_employee
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    payload = {
        **data.model_dump(mode="json"),
        **result,
        "currency": "NGN",
        "assumption": "Uniform average monthly employee cost; no statutory or salary forecast",
    }
    row = Plan(tenant_id=p["tenant_id"], creator_id=p["sub"], payload=encrypt(payload))
    db.add(row)
    db.flush()
    audit(db, p, "planning.scenario_created", row.id, request)
    return {"id": row.id, **payload}
