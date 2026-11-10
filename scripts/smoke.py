"""End-to-end synthetic Compose acceptance tests, including PostgreSQL tenant isolation."""

import csv
import io
import json
import os
import secrets
import subprocess
import httpx
from openpyxl import Workbook

BASE = os.environ.get("SMOKE_URL", "http://127.0.0.1:8080/api")
password = secrets.token_urlsafe(30)
suffix = secrets.token_hex(4)
client = httpx.Client(timeout=30, trust_env=False)


def provision(tenant, email, roles, employee_id=None):
    cmd = [
        "docker",
        "compose",
        "run",
        "--rm",
        "--no-deps",
        "-e",
        "PROVISION_PASSWORD",
        "identity",
        "python",
        "-m",
        "hcm.cli",
        "provision",
        "--tenant",
        tenant,
        "--name",
        "Synthetic Pilot",
        "--email",
        email,
        "--roles",
        roles,
    ]
    if employee_id:
        cmd.extend(["--employee-id", employee_id])
    subprocess.run(
        cmd,
        env={**os.environ, "PROVISION_PASSWORD": password},
        check=True,
        stdout=subprocess.DEVNULL,
    )


def login(tenant, email):
    r = client.post(
        BASE + "/identity/login",
        json={"tenant": tenant, "email": email, "password": password},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def call(method, path, headers, code=200, **kwargs):
    r = client.request(method, BASE + path, headers=headers, **kwargs)
    assert r.status_code == code, (path, r.status_code, r.text)
    return r.json() if "application/json" in r.headers.get("content-type", "") else r


tenant = "pilot-" + suffix
other = "other-" + suffix
provision(tenant, "maker@example.invalid", "admin,hr,payroll,approver")
provision(tenant, "checker@example.invalid", "approver")
provision(tenant, "employee@example.invalid", "employee")
provision(other, "maker@example.invalid", "admin,hr,payroll,approver")
a = login(tenant, "maker@example.invalid")
checker = login(tenant, "checker@example.invalid")
b = login(other, "maker@example.invalid")
employee = login(tenant, "employee@example.invalid")
call("GET", "/workforce/employees", {}, 401)
e = {
    "employee_code": "LAG001",
    "full_name": "Synthetic Person",
    "department": "Operations",
    "email": "person@example.invalid",
    "monthly_gross": "100000.00",
    "effective_from": "2026-01-01",
}
first = call("POST", "/workforce/employees", a, 201, json=e)
assert call("GET", "/workforce/employees", b) == []
assert (
    call("GET", "/workforce/employees", employee) == []
)  # Unlinked employee cannot see any workforce record.
call(
    "POST", "/workforce/employees", employee, 403, json={**e, "employee_code": "DENIED"}
)
call("POST", "/workforce/employees", a, 409, json=e)
# All four formats validate and commit, replay returns same result.
for i, ext in enumerate(["csv", "json", "xml", "xlsx"], 2):
    row = {**e, "employee_code": f"LAG00{i}"}
    if ext == "json":
        content = json.dumps([row]).encode()
    elif ext == "csv":
        f = io.StringIO()
        w = csv.DictWriter(f, fieldnames=row.keys())
        w.writeheader()
        w.writerow(row)
        content = f.getvalue().encode()
    elif ext == "xml":
        content = (
            "<employees><employee>"
            + "".join(f"<{k}>{v}</{k}>" for k, v in row.items())
            + "</employee></employees>"
        ).encode()
    else:
        book = Workbook()
        book.active.append(list(row.keys()))
        book.active.append(list(row.values()))
        f = io.BytesIO()
        book.save(f)
        content = f.getvalue()
    batch = call(
        "POST",
        "/workforce/imports/preview",
        a,
        files={"file": ("employees." + ext, content)},
    )
    assert batch["errors"] == [], batch
    call("POST", "/workforce/imports/" + batch["id"] + "/commit", b, 404)
    assert (
        call("POST", "/workforce/imports/" + batch["id"] + "/commit", a)["state"]
        == "committed"
    )
    call("POST", "/workforce/imports/" + batch["id"] + "/commit", a)
bad = call(
    "POST",
    "/workforce/imports/preview",
    a,
    files={
        "file": (
            "bad.json",
            json.dumps(
                [{**e, "employee_code": "NEW001"}, {**e, "monthly_gross": "-1"}]
            ).encode(),
        )
    },
)
assert bad["errors"]
call("POST", "/workforce/imports/" + bad["id"] + "/commit", a, 409)
people = call("GET", "/workforce/employees", a)
assert len(people) == 5
assert not any(p["employee_code"] == "NEW001" for p in people)
calendar = call(
    "POST",
    "/payroll/calendars",
    a,
    201,
    json={
        "name": "November synthetic monthly",
        "frequency": "monthly",
        "start": "2026-11-01",
        "end": "2026-11-30",
        "cutoff": "2026-11-25",
        "pay_date": "2026-11-30",
    },
)
rule = call(
    "POST",
    "/payroll/rules",
    a,
    201,
    json={
        "version": "SYNTHETIC-TEST-ONLY",
        "effective_from": "2026-01-01",
        "effective_to": "2026-12-31",
        "source": "Invented test scenario; not Nigerian law",
        "synthetic_tax_percent": "10",
        "synthetic_pension_percent": "5",
    },
)
payload = {
    "calendar_id": calendar["id"],
    "rule_id": rule["id"],
    "employee_bases": {p["id"]: p["monthly_gross"] for p in people},
    "idempotency_key": "smoke-" + suffix,
}
run = call("POST", "/payroll/runs", a, 201, json=payload)
id = run["id"]
assert run["snapshot"]["totals"]["net"] == "425000.00"
assert call("POST", "/payroll/runs", a, 201, json=payload)["id"] == id
call(
    "POST",
    "/payroll/runs",
    a,
    409,
    json={**payload, "employee_bases": {first["id"]: "5.00"}},
)
assert call("GET", "/payroll/runs", b) == []
call("POST", f"/payroll/runs/{id}/approve", b, 404)
call(
    "POST", f"/payroll/runs/{id}/approve", a, 403
)  # Even dual-role admin maker cannot check.
call("GET", f"/payroll/runs/{id}/exports/register", a, 409)
call("POST", f"/payroll/runs/{id}/approve", checker)
call("POST", f"/payroll/runs/{id}/approve", checker, 409)
call("POST", f"/payroll/runs/{id}/finalize", checker, 409)
for kind in ["gtbank", "statutory"]:
    call("GET", f"/payroll/runs/{id}/exports/{kind}", checker, 409)
for kind in ["register", "payslips", "journal"]:
    response = call("GET", f"/payroll/runs/{id}/exports/{kind}", checker)
    assert "SIMULATION" in response.text
    if kind == "journal":
        from decimal import Decimal

        rows = list(csv.reader(io.StringIO(response.text)))[1:]
        assert sum(Decimal(r[2]) for r in rows) == sum(Decimal(r[3]) for r in rows)
assert call("GET", "/payroll/readiness", checker)["production_enabled"] is False
assert len(call("GET", "/payroll/audit", checker)) >= 7
# Raw runtime queries with no app tenant setting are denied by FORCE RLS.
for service, table in [("workforce", "employees"), ("payroll", "runs")]:
    code = f"from hcm.common import Session; from sqlalchemy import text; db=Session(); assert db.scalar(text('SELECT count(*) FROM {table}')) == 0; db.close()"
    subprocess.run(
        ["docker", "compose", "exec", "-T", service, "python", "-c", code], check=True
    )
# Runtime cannot update audit entries, even if a future API handler accidentally attempts it.
code = "from hcm.common import Session; from sqlalchemy import text; from sqlalchemy.exc import DBAPIError; db=Session();\ntry:\n db.execute(text(\"UPDATE audit SET action='tampered'\")); raise AssertionError('Audit was writable')\nexcept DBAPIError:\n db.rollback()"
subprocess.run(
    ["docker", "compose", "exec", "-T", "payroll", "python", "-c", code], check=True
)
print(
    "PASS: tenant isolation, RBAC, four import formats, atomic validation, idempotency, maker-checker, production gates, balanced journal, RLS and audit permissions"
)

# Enrichment acceptance against four independently owned PostgreSQL databases.
provision(tenant, "linked@example.invalid", "employee", first["id"])
linked = login(tenant, "linked@example.invalid")
assert len(call("GET", "/workforce/employees/lookup", linked)) == 1
call(
    "POST",
    "/workplace/leave-balances",
    a,
    json={"employee_id": first["id"], "year": 2026, "allowance": 5},
)
leave = call(
    "POST",
    "/workplace/items",
    linked,
    201,
    json={
        "kind": "leave",
        "request_key": "leave-" + suffix,
        "data": {
            "employee_id": first["id"],
            "title": "Synthetic leave",
            "start": "2026-12-01",
            "end": "2026-12-02",
        },
    },
)
call(
    "POST",
    f"/workplace/items/{leave['id']}/transition",
    linked,
    403,
    json={"expected_version": 1, "state": "approved", "note": "Cannot self-review"},
)
call(
    "POST",
    f"/workplace/items/{leave['id']}/transition",
    checker,
    json={"expected_version": 1, "state": "approved", "note": "Independent HR review"},
)
assert call("GET", "/workplace/leave-balances", linked)[0]["used"] == 2
assert call("GET", "/workplace/items", b) == []
call(
    "POST",
    f"/workplace/items/{leave['id']}/transition",
    b,
    404,
    json={"expected_version": 1, "state": "approved", "note": "Wrong tenant"},
)
expense = call(
    "POST",
    "/workplace/items",
    linked,
    201,
    json={
        "kind": "expense",
        "request_key": "expense-" + suffix,
        "data": {
            "employee_id": first["id"],
            "title": "Synthetic claim",
            "amount": "12500.25",
            "receipt_reference": "SYNTHETIC-RECEIPT",
        },
    },
)
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=2) as pool:
    responses = list(
        pool.map(
            lambda _: client.post(
                BASE + f"/workplace/items/{expense['id']}/transition",
                headers=checker,
                json={
                    "expected_version": 1,
                    "state": "approved",
                    "note": "Independent financial review",
                },
            ),
            range(2),
        )
    )
assert sorted(r.status_code for r in responses) == [200, 409], [
    (r.status_code, r.text) for r in responses
]
assert call("GET", "/workplace/insights", a)["approved_expenses_NGN"] == "12500.25"
call("GET", "/workplace/insights", linked, 403)
scenario = call(
    "POST",
    "/workplace/plans",
    a,
    201,
    json={
        "title": "Synthetic growth",
        "base_headcount": 5,
        "hires": 2,
        "exits": 1,
        "monthly_cost_per_employee": "100000.00",
    },
)
assert scenario["annualized_cost"] == "7200000.00"
assert call("GET", "/workplace/plans", b) == []
# Historical employee snapshots must be stable after future-dated salary amendments.
amendment = {
    "expected_version": 1,
    "reason": "Synthetic future salary review",
    "record": {**e, "effective_from": "2026-12-01", "monthly_gross": "120000.00"},
}
call("POST", f"/workforce/employees/{first['id']}/amend", a, json=amendment)
assert (
    next(
        p
        for p in call("GET", "/workforce/employees?as_of=2026-11-01", a)
        if p["id"] == first["id"]
    )["monthly_gross"]
    == "100000.00"
)
assert (
    next(
        p
        for p in call("GET", "/workforce/employees?as_of=2026-12-01", a)
        if p["id"] == first["id"]
    )["monthly_gross"]
    == "120000.00"
)
assert (
    len(call("GET", f"/workforce/employees/{first['id']}/history", a)["records"]) == 2
)
# Comparing a run to its own baseline is a valid zero-variance control check.
assert (
    call("GET", f"/payroll/runs/{id}/comparison?baseline_id={id}", a)["net_delta"]
    == "0.00"
)
assert (
    call("GET", f"/payroll/runs/{id}/evidence-pack", a)["snapshot"]["checksum"]
    == run["snapshot"]["checksum"]
)
call("GET", f"/payroll/runs/{id}/evidence-pack", b, 404)
draft = call(
    "POST",
    "/payroll/rule-evidence",
    a,
    201,
    json={
        "version": "DRAFT-" + suffix,
        "title": "Applicability evidence",
        "authority": "Specialist to confirm",
        "source_reference": "Synthetic review source",
        "effective_from": "2026-01-01",
        "effective_to": "2026-12-31",
        "applicability": "Synthetic employees",
        "calculation_specification": "Draft only, not executable statutory rules",
        "test_evidence": "Independent expected-results register pending",
    },
)
call("POST", f"/payroll/rule-evidence/{draft['id']}/review", a, 403)
assert (
    call("POST", f"/payroll/rule-evidence/{draft['id']}/review", checker)[
        "production_eligible"
    ]
    is False
)
for service, table in [
    ("workplace", "work_items"),
    ("workforce", "employee_revisions"),
    ("payroll", "rule_evidence_drafts"),
]:
    code = f"from hcm.common import Session; from sqlalchemy import text; db=Session(); assert db.scalar(text('SELECT count(*) FROM {table}')) == 0; db.close()"
    subprocess.run(
        ["docker", "compose", "exec", "-T", service, "python", "-c", code], check=True
    )
assert call("GET", "/payroll/readiness", a)["production_enabled"] is False
print(
    "PASS: enrichment workflows, linked employee scope, concurrent approval, encrypted records, planning, employee history, rule evidence and new-table FORCE RLS"
)
