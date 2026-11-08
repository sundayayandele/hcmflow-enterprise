"""Explicit operator provisioning and first schema migration. No public signup API."""

import argparse
import getpass
import importlib
import os
import uuid
from sqlalchemy import select, text
from hcm.common import Base, SERVICE, engine, Session

module = importlib.import_module("hcm." + SERVICE)


def migrate():
    Base.metadata.create_all(engine)
    if engine.dialect.name == "postgresql":
        with engine.begin() as c:
            for table in Base.metadata.sorted_tables:
                if "tenant_id" not in table.c or SERVICE == "identity":
                    continue
                name = table.name
                c.execute(text(f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY'))
                c.execute(text(f'ALTER TABLE "{name}" FORCE ROW LEVEL SECURITY'))
                c.execute(text(f'DROP POLICY IF EXISTS tenant_isolation ON "{name}"'))
                c.execute(
                    text(
                        f'''CREATE POLICY tenant_isolation ON "{name}" USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))'''
                    )
                )
            # Runtime roles cannot rewrite or delete audit history. Audit owner remains the migration identity.
            runtime = os.environ.get("RUNTIME_ROLE")
            if runtime:
                if runtime not in ("identity_app", "workforce_app", "payroll_app"):
                    raise ValueError("Invalid runtime role")
                c.execute(
                    text(
                        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {runtime}"
                    )
                )
                c.execute(
                    text(f"REVOKE UPDATE, DELETE, TRUNCATE ON audit FROM {runtime}")
                )


def provision(slug, name, email, roles):
    if SERVICE != "identity":
        raise ValueError("Provision through identity service only")
    allowed = {"admin", "hr", "payroll", "approver", "auditor", "employee"}
    if not set(roles.split(",")).issubset(allowed):
        raise ValueError("Unknown roles")
    password = os.environ.get("PROVISION_PASSWORD") or getpass.getpass(
        "New password (16+ characters): "
    )
    if len(password) < 16:
        raise ValueError("Password must have at least 16 characters")
    from hcm.identity import Tenant, User, passwords

    with Session.begin() as db:
        tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
        if not tenant:
            tenant = Tenant(id=str(uuid.uuid4()), slug=slug, name=name)
            db.add(tenant)
            db.flush()
        if db.scalar(
            select(User).where(User.tenant_id == tenant.id, User.email == email.lower())
        ):
            raise ValueError("User already exists")
        db.add(
            User(
                tenant_id=tenant.id,
                email=email.lower(),
                password_hash=passwords.hash(password),
                roles=roles,
            )
        )
    print("User provisioned; no credentials printed")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["migrate", "provision"])
    p.add_argument("--tenant")
    p.add_argument("--name")
    p.add_argument("--email")
    p.add_argument("--roles", default="employee")
    a = p.parse_args()
    if a.command == "migrate":
        migrate()
    else:
        if not all((a.tenant, a.name, a.email)):
            p.error("provision requires --tenant --name --email")
        provision(a.tenant, a.name, a.email, a.roles)
