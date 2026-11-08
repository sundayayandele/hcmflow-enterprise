import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET", "x" * 64)
from decimal import Decimal
import io
import pytest
from fastapi import HTTPException
from hcm.payroll import calc, CalendarInput, RunInput
from hcm.intake import parse
from openpyxl import Workbook

RULE = {
    "version": "synthetic-test-v1",
    "synthetic_tax_percent": "10",
    "synthetic_pension_percent": "5",
}


def test_decimal_rounding_and_reconciliation():
    r = calc("100.05", RULE, [])
    assert r["gross"] == "100.05" and r["deductions"] == "15.01" and r["net"] == "85.04"
    assert Decimal(r["gross"]) - Decimal(r["deductions"]) + Decimal(
        r["reimbursements"]
    ) == Decimal(r["net"])


def test_elements_and_employer_cost_does_not_reduce_net():
    es = [
        {
            "code": "BONUS",
            "label": "Bonus",
            "kind": "earning",
            "method": "percent_base",
            "value": "10",
        },
        {
            "code": "COST",
            "label": "Employer cost",
            "kind": "employer_cost",
            "method": "fixed",
            "value": "25",
        },
        {
            "code": "EXP",
            "label": "Expense",
            "kind": "reimbursement",
            "method": "fixed",
            "value": "20",
        },
    ]
    r = calc("100", RULE, es)
    assert r["gross"] == "110.00" and r["net"] == "113.50"


def test_negative_net_blocked():
    with pytest.raises(HTTPException):
        calc(
            "100",
            {
                "version": "x",
                "synthetic_tax_percent": "100",
                "synthetic_pension_percent": "10",
            },
            [],
        )


def test_invalid_calendar_and_amounts():
    with pytest.raises(ValueError):
        CalendarInput(
            name="Bad calendar",
            frequency="monthly",
            start="2026-02-01",
            end="2026-01-01",
            cutoff="2026-01-25",
            pay_date="2026-01-28",
        )
    for value in ["NaN", "-1", "1.001"]:
        with pytest.raises(ValueError):
            RunInput(
                calendar_id="x",
                rule_id="y",
                employee_bases={"z": value},
                idempotency_key="abcdefgh",
            )


def test_xml_external_entities_blocked():
    with pytest.raises(HTTPException):
        parse(
            "x.xml",
            b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><employees><employee><full_name>&e;</full_name></employee></employees>',
        )


def test_formats_and_formula_rejection():
    assert (
        parse("x.csv", b"employee_code,full_name\nABC,Test Person")[0]["employee_code"]
        == "ABC"
    )
    assert parse("x.json", b'[{"employee_code":"ABC"}]')[0]["employee_code"] == "ABC"
    assert (
        parse(
            "x.xml",
            b"<employees><employee><employee_code>ABC</employee_code></employee></employees>",
        )[0]["employee_code"]
        == "ABC"
    )
    book = Workbook()
    book.active.append(["employee_code", "full_name"])
    book.active.append(["ABC", "Test Person"])
    f = io.BytesIO()
    book.save(f)
    assert parse("x.xlsx", f.getvalue())[0]["employee_code"] == "ABC"
    book.active.append(["DEF", "=1+1"])
    f = io.BytesIO()
    book.save(f)
    with pytest.raises(HTTPException):
        parse("x.xlsx", f.getvalue())


def test_csv_formula_neutralization():
    from hcm.payroll import csv_cell

    for value in ["=1+1", "+CMD", "-CMD", "@SUM(A1)", "  =1+1"]:
        assert csv_cell(value).startswith("'")
    assert csv_cell("LAG001") == "LAG001"


def test_ambiguous_import_fields_are_rejected():
    for filename, content in [
        ("x.csv", b"employee_code,employee_code\nABC,DEF"),
        ("x.json", b'[{"employee_code":"ABC","employee_code":"DEF"}]'),
        (
            "x.xml",
            b"<employees><employee><employee_code>ABC</employee_code><employee_code>DEF</employee_code></employee></employees>",
        ),
    ]:
        with pytest.raises(HTTPException):
            parse(filename, content)
