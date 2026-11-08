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


def provision(tenant, email, roles):
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
