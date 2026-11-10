"""Authorization and state-machine tests against transactional APIs; PostgreSQL RLS is tested by CI smoke."""

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET", "x" * 64)
os.environ.setdefault("PII_KEY", "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=")
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from hcm import common, workplace, workforce, payroll
from hcm.workplace_domain import staffing_projection

A = str(uuid.uuid4())
B = str(uuid.uuid4())
EA = str(uuid.uuid4())
EB = str(uuid.uuid4())
ACTORS = {
    name: str(uuid.uuid4())
    for name in ["admin", "checker", "employee", "finance", "other", "talent"]
}


def headers(name="admin", tenant=A, employee=None, roles=None):
    defaults = {
        "admin": ["admin", "hr", "payroll", "approver"],
        "checker": ["approver", "hr"],
        "employee": ["employee"],
        "finance": ["finance"],
        "other": ["admin"],
        "talent": ["talent"],
    }
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": ACTORS[name],
            "tenant_id": tenant,
            "roles": roles or defaults[name],
            "employee_id": employee,
            "iat": now,
            "exp": now + timedelta(minutes=15),
            "aud": "hcmflow",
            "iss": "hcmflow-identity",
        },
        common.JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": "Bearer " + token}


@pytest.fixture
def apps(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    common.Base.metadata.create_all(engine)
    monkeypatch.setattr(common, "engine", engine)
    monkeypatch.setattr(common, "Session", sessionmaker(engine, expire_on_commit=False))

    def lookup(request, path="/employees/lookup"):
        token = request.headers["authorization"].split()[1]
        tenant = jwt.decode(
            token, common.JWT_SECRET, algorithms=["HS256"], audience="hcmflow"
        )["tenant_id"]
        return [
            {
                "id": EA if tenant == A else EB,
                "employee_code": "EMP001",
                "full_name": "Synthetic Person",
            }
        ]

    monkeypatch.setattr(workplace, "workforce", lookup)
    with (
        TestClient(workplace.app) as w,
        TestClient(workforce.app) as f,
        TestClient(payroll.app) as p,
    ):
        yield w, f, p
    engine.dispose()


def make(client, kind, data, h=None, key=None):
    return client.post(
        "/items",
        headers=h or headers(),
        json={"kind": kind, "data": data, "request_key": key or str(uuid.uuid4())},
    )


def decide(client, row, state, h=None):
    return client.post(
        "/items/" + row["id"] + "/transition",
        headers=h or headers("checker"),
        json={
            "state": state,
            "expected_version": row["version"],
            "note": "Synthetic review evidence",
        },
    )


def test_leave_balance_overlap_independent_review_and_atomic_debit(apps):
    w, _, _ = apps
    admin = headers()
    employee = headers("employee", employee=EA)
    assert (
        w.post(
            "/leave-balances",
            headers=admin,
            json={"employee_id": EA, "year": 2026, "allowance": 3},
        ).status_code
        == 200
    )
    payload = {
        "employee_id": EA,
        "title": "Annual leave",
        "start": "2026-12-01",
        "end": "2026-12-02",
    }
    row = make(w, "leave", payload, employee).json()
    assert decide(w, row, "approved", employee).status_code == 403
    assert make(w, "leave", payload, employee).status_code == 409
    approved = decide(w, row, "approved")
    assert approved.status_code == 200, approved.text
    assert decide(w, approved.json(), "rejected").status_code == 409
    balance = w.get("/leave-balances", headers=employee).json()[0]
    assert balance["used"] == 2 and balance["available"] == 1
    assert (
        make(
            w,
            "leave",
            {**payload, "start": "2026-12-04", "end": "2026-12-05"},
            employee,
        ).status_code
        == 409
    )
    assert (
        w.post(
            "/leave-balances",
            headers=admin,
            json={"employee_id": EA, "year": 2026, "allowance": 1},
        ).status_code
        == 409
    )


def test_tenant_and_employee_scope_and_request_replay(apps):
    w, _, _ = apps
    owner = headers("employee", employee=EA)
    data = {
        "employee_id": EA,
        "title": "Time entry",
        "day": "2026-11-10",
        "hours": "8.00",
    }
    row = make(w, "time", data, owner, key="replay-key").json()
    assert make(w, "time", data, owner, key="replay-key").json()["id"] == row["id"]
    assert (
        make(w, "time", {**data, "hours": "9.00"}, owner, key="replay-key").status_code
        == 409
    )
    assert w.get("/items", headers=headers("other", B)).json() == []
    assert decide(w, row, "approved", headers("other", B)).status_code == 404
    assert w.get("/items", headers=headers("employee", employee=EB)).json() == []
    assert make(w, "time", {**data, "employee_id": EB}, owner).status_code == 403
    assert make(w, "time", data, headers("other", B)).status_code == 422
    assert w.get("/items").status_code == 401


def test_finance_maker_checker_and_restricted_cases(apps):
    w, _, _ = apps
    expense = make(
        w,
        "expense",
        {
            "employee_id": EA,
            "title": "Travel claim",
            "amount": "12500.25",
            "receipt_reference": "SYNTHETIC-RECEIPT",
        },
    ).json()
    assert decide(w, expense, "approved", headers()).status_code == 403
    r = decide(w, expense, "approved", headers("finance"))
    assert r.status_code == 200
    assert decide(w, r.json(), "paid", headers("finance")).status_code == 409
    case = make(
        w,
        "disciplinary",
        {
            "employee_id": EA,
            "title": "Restricted case",
            "description": "Synthetic evidence for testing",
        },
    ).json()
    assert (
        w.get(
            "/items?kind=disciplinary", headers=headers("employee", employee=EA)
        ).json()
        == []
    )
    assert w.get("/items?kind=disciplinary", headers=headers("finance")).json() == []
    assert decide(w, case, "in_progress", headers("finance")).status_code == 404
    insight = w.get("/insights", headers=headers("finance")).json()
    assert insight["approved_expenses_NGN"] == "12500.25"
    assert not any(r["kind"] == "disciplinary" for r in insight["counts"])


def test_checklists_cannot_complete_with_open_tasks(apps):
    w, _, _ = apps
    row = make(
        w,
        "onboarding",
        {
            "employee_id": EA,
            "title": "New starter",
            "tasks": ["Issue laptop", "Read policies"],
        },
    ).json()
    row = decide(w, row, "in_progress", headers()).json()
    assert decide(w, row, "completed", headers()).status_code == 409
    for index in range(2):
        r = w.post(
            "/items/" + row["id"] + "/tasks",
            headers=headers(),
            json={
                "expected_version": row["version"],
                "index": index,
                "completed": True,
            },
        )
        assert r.status_code == 200
        r = r.json()
        row = r
    assert decide(w, row, "completed", headers()).status_code == 200


def test_goal_learning_and_candidate_lifecycles(apps):
    w, _, _ = apps
    employee = headers("employee", employee=EA)
    goal = make(
        w,
        "goal",
        {
            "employee_id": EA,
            "title": "Improve onboarding",
            "due": "2026-12-31",
            "success_measure": "Complete all assigned tasks",
        },
        employee,
    ).json()
    goal = decide(w, goal, "active", employee).json()
    assert decide(w, goal, "completed", employee).status_code == 200
    learning = make(
        w,
        "learning",
        {
            "employee_id": EA,
            "title": "Safety induction",
            "provider": "Internal training",
            "due": "2026-12-31",
        },
        headers("talent"),
    ).json()
    learning = decide(w, learning, "completion_requested", employee).json()
    assert decide(w, learning, "verified", employee).status_code == 403
    assert decide(w, learning, "verified", headers("talent")).status_code == 200
    candidate = make(
        w,
        "candidate",
        {
            "title": "Synthetic candidate",
            "role": "Analyst",
            "email": "candidate@example.invalid",
        },
    ).json()
    for state in ["screening", "interview", "offer", "hired"]:
        r = decide(w, candidate, state, headers())
        assert r.status_code == 200
        candidate = r.json()
    assert decide(w, candidate, "screening", headers()).status_code == 409


def test_plan_math_roles_and_no_implied_payroll_forecast(apps):
    w, _, _ = apps
    assert staffing_projection(10, 3, 1, "100.25")["annualized_cost"] == "14436.00"
    data = {
        "title": "Growth scenario",
        "base_headcount": 10,
        "hires": 3,
        "exits": 1,
        "monthly_cost_per_employee": "100.25",
    }
    r = w.post("/plans", headers=headers("finance"), json=data)
    assert r.status_code == 201 and r.json()["projected_headcount"] == 12
    assert "no statutory" in r.json()["assumption"]
    assert (
        w.post(
            "/plans", headers=headers("finance"), json={**data, "exits": 20}
        ).status_code
        == 422
    )
    assert w.get("/plans", headers=headers("other", B)).json() == []
    assert w.get("/plans", headers=headers("employee", employee=EA)).status_code == 403
    assert (
        w.get("/access-policy", headers=headers("employee", employee=EA)).status_code
        == 403
    )
    assert w.get("/access-policy", headers=headers()).status_code == 200


def test_employee_amendment_keeps_effective_history_and_source(apps):
    _, f, _ = apps
    h = headers()
    data = {
        "employee_code": "EMP001",
        "full_name": "Synthetic Person",
        "department": "Operations",
        "email": "person@example.invalid",
        "monthly_gross": "100.00",
        "effective_from": "2026-01-01",
    }
    e = f.post("/employees", headers=h, json=data).json()
    change = {
        "expected_version": 1,
        "reason": "Approved salary review",
        "record": {**data, "monthly_gross": "120.00", "effective_from": "2026-12-01"},
    }
    r = f.post("/employees/" + e["id"] + "/amend", headers=h, json=change)
    assert r.status_code == 200, r.text
    assert (
        f.get("/employees?as_of=2026-11-01", headers=h).json()[0]["monthly_gross"]
        == "100.00"
    )
    assert (
        f.get("/employees?as_of=2026-12-01", headers=h).json()[0]["monthly_gross"]
        == "120.00"
    )
    assert (
        f.get("/employees?as_of=2026-11-01&period_end=2026-12-05", headers=h).json()[0][
            "changes_in_period"
        ]
        is True
    )
    assert (
        len(f.get("/employees/" + e["id"] + "/history", headers=h).json()["records"])
        == 2
    )
    assert (
        f.post("/employees/" + e["id"] + "/amend", headers=h, json=change).status_code
        == 409
    )
    assert (
        f.get(
            "/employees/" + e["id"] + "/history", headers=headers("other", B)
        ).status_code
        == 404
    )


def test_statutory_evidence_review_never_enables_production(apps):
    _, _, p = apps
    data = {
        "version": "DRAFT-NG-001",
        "title": "Rule applicability draft",
        "authority": "Reviewer to confirm",
        "source_reference": "Synthetic source reference",
        "effective_from": "2026-01-01",
        "effective_to": "2026-12-31",
        "applicability": "Synthetic population",
        "calculation_specification": "Specification pending independent legal review",
        "test_evidence": "Synthetic expected-result register",
    }
    row = p.post("/rule-evidence", headers=headers(), json=data).json()
    assert row["production_eligible"] is False
    assert (
        p.post("/rule-evidence/" + row["id"] + "/review", headers=headers()).status_code
        == 403
    )
    r = p.post("/rule-evidence/" + row["id"] + "/review", headers=headers("checker"))
    assert r.status_code == 200 and r.json()["production_eligible"] is False
    assert p.get("/rule-evidence", headers=headers("other", B)).json() == []
    assert p.get("/readiness", headers=headers()).json()["production_enabled"] is False


def test_failed_commit_cannot_acknowledge_a_successful_write(apps, monkeypatch):
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session as SqlSession

    w, _, _ = apps
    original = common.Session

    class FailingSession(SqlSession):
        def commit(self):
            raise IntegrityError(
                "Synthetic deferred constraint", {}, Exception("constraint failed")
            )

    monkeypatch.setattr(
        common,
        "Session",
        sessionmaker(
            original.kw["bind"], class_=FailingSession, expire_on_commit=False
        ),
    )
    r = make(
        w,
        "service",
        {
            "employee_id": EA,
            "title": "Commit failure test",
            "description": "Synthetic rollback evidence",
        },
    )
    assert r.status_code == 409, r.text
    with original() as db:
        assert (
            db.scalar(
                __import__("sqlalchemy")
                .select(__import__("sqlalchemy").func.count())
                .select_from(workplace.WorkItem)
            )
            == 0
        )


def test_payslip_archive_release_ownership_and_immutable_snapshot(apps, monkeypatch):
    _, _, client = apps
    monkeypatch.setattr(payroll, "payslip_today", lambda: "2026-11-10")
    with common.Session() as db:
        run = payroll.Run(
            tenant_id=A,
            idempotency_key="payslip-test",
            request_hash="x" * 64,
            maker=ACTORS["admin"],
            snapshot={
                "calendar": {
                    "start": "2026-11-01",
                    "end": "2026-11-30",
                    "pay_date": "2026-11-30",
                },
                "checksum": "sealed-checksum",
                "results": [
                    {
                        "employee_id": EA,
                        "employee_code": "EMP001",
                        "gross": "100000.00",
                        "deductions": "1000.00",
                        "net": "99000.00",
                        "lines": [],
                    }
                ],
            },
        )
        db.add(run)
        db.commit()
        run_id = run.id
    assert (
        client.post(f"/runs/{run_id}/payslips", headers=headers("checker")).status_code
        == 409
    )
    assert client.post(f"/runs/{run_id}/approve", headers=headers()).status_code == 403
    assert (
        client.get("/payslips", headers=headers("employee", employee=EA)).json()[
            "slips"
        ]
        == []
    )
    assert (
        client.post(f"/runs/{run_id}/approve", headers=headers("checker")).status_code
        == 200
    )
    assert (
        client.post(f"/runs/{run_id}/payslips", headers=headers("checker")).status_code
        == 200
    )
    assert client.post(f"/runs/{run_id}/payslips", headers=headers()).status_code == 403
    employee = headers("employee", employee=EA)
    slips = client.get("/payslips?as_of=2099-01-01", headers=employee).json()
    assert slips["today"] == "2026-11-10"
    assert len(slips["slips"]) == 1
    slip = slips["slips"][0]
    assert slip["available"] is False and "net" not in slip and "result" not in slip
    url = f"/payslips/{slip['id']}"
    assert client.get(url, headers=employee).status_code == 404
    assert (
        client.get(f"/runs/{run_id}/exports/payslips", headers=employee).status_code
        == 404
    )
    monkeypatch.setattr(payroll, "payslip_today", lambda: "2026-11-30")
    assert (
        client.get("/payslips", headers=employee).json()["slips"][0]["available"]
        is True
    )
    assert client.get(url, headers=employee).json()["result"]["net"] == "99000.00"
    for h in [
        headers(),
        headers("employee", employee=EB),
        headers("employee", tenant=B, employee=EA),
    ]:
        assert client.get(url, headers=h).status_code == 404
        assert client.get("/payslips", headers=h).json()["slips"] == []
    with common.Session() as db:
        run = db.get(payroll.Run, run_id)
        run.snapshot = {**run.snapshot, "results": []}
        db.commit()
        sealed = db.get(payroll.PayslipArchive, slip["id"]).sealed
        assert "99000" not in sealed
    assert client.get(url, headers=employee).json()["result"]["net"] == "99000.00"
    assert (
        client.post(f"/runs/{run_id}/finalize", headers=headers("checker")).status_code
        == 409
    )
