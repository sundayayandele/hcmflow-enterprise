"""Typed first increments for workforce operations, talent and employee finance."""

from datetime import date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Leave(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    start: date
    end: date

    @model_validator(mode="after")
    def dates(self):
        if self.end < self.start or self.start.year != self.end.year or self.days > 60:
            raise ValueError("Use a same-year period of at most 60 calendar days")
        return self

    @property
    def days(self):
        return (self.end - self.start).days + 1


class TimeEntry(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    day: date
    hours: Decimal = Field(gt=0, le=24, max_digits=4, decimal_places=2)


class Expense(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    amount: Decimal = Field(gt=0, le=100000000, max_digits=12, decimal_places=2)
    receipt_reference: str = Field(min_length=3, max_length=200)
    currency: str = Field(default="NGN", pattern="^NGN$")


class Benefit(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    plan: str = Field(min_length=2, max_length=100)


class Candidate(Input):
    title: str = Field(min_length=3, max_length=120)
    role: str = Field(min_length=2, max_length=100)
    email: str = Field(max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class Checklist(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    tasks: list[str] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_tasks(self):
        if any(not t.strip() or len(t) > 150 for t in self.tasks) or len(
            set(self.tasks)
        ) != len(self.tasks):
            raise ValueError("Use unique non-empty task labels, at most 150 characters")
        return self


class Goal(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    due: date
    success_measure: str = Field(min_length=3, max_length=300)


class Learning(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    provider: str = Field(min_length=2, max_length=100)
    due: date


class Case(Input):
    employee_id: str
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=2000)


SCHEMAS = {
    "leave": Leave,
    "time": TimeEntry,
    "expense": Expense,
    "benefit": Benefit,
    "candidate": Candidate,
    "onboarding": Checklist,
    "exit": Checklist,
    "goal": Goal,
    "learning": Learning,
    "service": Case,
    "disciplinary": Case,
}
# Tenant-wide administrators are explicit; other employees receive own-record access only.
READERS = {
    "leave": {"admin", "hr", "approver"},
    "time": {"admin", "hr", "approver"},
    "expense": {"admin", "finance", "payroll", "approver"},
    "benefit": {"admin", "hr", "finance", "approver"},
    "candidate": {"admin", "hr", "recruiter"},
    "onboarding": {"admin", "hr"},
    "exit": {"admin", "hr"},
    "goal": {"admin", "hr", "talent"},
    "learning": {"admin", "hr", "talent"},
    "service": {"admin", "hr"},
    "disciplinary": {"admin", "hr"},
}
CREATORS = {k: v - {"approver"} for k, v in READERS.items()}
SELF_CREATE = {"leave", "time", "expense", "benefit", "goal", "service"}
SELF_READ = SELF_CREATE | {"learning", "onboarding", "exit"}
TRANSITIONS = {
    "leave": {"submitted": ["approved", "rejected"]},
    "time": {"submitted": ["approved", "rejected"]},
    "expense": {"submitted": ["approved", "rejected"]},
    "benefit": {"submitted": ["approved", "rejected"]},
    "candidate": {
        "new": ["screening", "rejected"],
        "screening": ["interview", "rejected"],
        "interview": ["offer", "rejected"],
        "offer": ["hired", "rejected"],
    },
    "onboarding": {"open": ["in_progress"], "in_progress": ["completed"]},
    "exit": {"open": ["in_progress"], "in_progress": ["completed"]},
    "goal": {"draft": ["active"], "active": ["completed"]},
    "learning": {
        "assigned": ["completion_requested"],
        "completion_requested": ["verified", "assigned"],
    },
    "service": {"submitted": ["in_progress"], "in_progress": ["resolved"]},
    "disciplinary": {"submitted": ["in_progress"], "in_progress": ["resolved"]},
}
INITIAL = {
    "candidate": "new",
    "onboarding": "open",
    "exit": "open",
    "goal": "draft",
    "learning": "assigned",
}


def staffing_projection(headcount, hires, exits, monthly_cost):
    projected = headcount + hires - exits
    if projected < 0:
        raise ValueError("Planned exits exceed available headcount")
    cost = Decimal(str(monthly_cost))
    return {
        "projected_headcount": projected,
        "monthly_cost": str((cost * projected).quantize(Decimal("0.01"))),
        "annualized_cost": str((cost * projected * 12).quantize(Decimal("0.01"))),
    }
