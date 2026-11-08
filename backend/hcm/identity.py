import time
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from sqlalchemy import String, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column
from hcm.common import (
    Base,
    TenantRow,
    Session,
    JWT_SECRET,
    application,
    principal,
    audit,
)

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("constant-time-invalid-login")


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(150))


class User(TenantRow, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email"),)
    email: Mapped[str] = mapped_column(String(254))
    password_hash: Mapped[str] = mapped_column(String(255))
    roles: Mapped[str] = mapped_column(String(150))
    employee_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    active: Mapped[bool] = mapped_column(default=True)


class Login(BaseModel):
    tenant: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


app = application("HCMFlow Identity & Tenant")
# A single identity replica for this pilot. Edge also limits requests. Distributed limits before scaling.
failures = {}


@app.post("/login")
def login(data: Login, request: Request):
    key = request.client.host
    now = time.monotonic()
    recent = [t for t in failures.get(key, []) if t > now - 300]
    failures[key] = recent
    if len(recent) >= 20:
        raise HTTPException(429, "Too many login attempts; retry in five minutes")
    with Session() as db:
        tenant = db.scalar(select(Tenant).where(Tenant.slug == data.tenant))
        user = (
            db.scalar(
                select(User).where(
                    User.tenant_id == tenant.id, User.email == data.email.lower()
                )
            )
            if tenant
            else None
        )
        valid = passwords.verify(
            data.password, user.password_hash if user else DUMMY_HASH
        )
        if not user or not valid or not user.active:
            recent.append(now)
            raise HTTPException(401, "Invalid tenant or credentials")
        at = datetime.now(timezone.utc)
        claims = {
            "sub": user.id,
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "roles": user.roles.split(","),
            "employee_id": user.employee_id,
            "iat": at,
            "exp": at + timedelta(minutes=15),
            "iss": "hcmflow-identity",
            "aud": "hcmflow",
        }
        audit(db, claims, "session.created", user.id, request)
        db.commit()
        return {
            "access_token": jwt.encode(claims, JWT_SECRET, algorithm="HS256"),
            "token_type": "bearer",
            "expires_in": 900,
            "user": {
                k: v for k, v in claims.items() if k not in ("iat", "exp", "iss", "aud")
            },
        }


@app.get("/me")
def me(p=Depends(principal)):
    return p
