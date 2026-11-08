import hashlib
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy import JSON, String, DateTime, create_engine, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

SERVICE = os.environ.get("SERVICE", "identity")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "staging")
DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
if len(JWT_SECRET) < 48:
    raise RuntimeError("JWT_SECRET must be at least 48 characters")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
Session = sessionmaker(engine, expire_on_commit=False)
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("hcmflow")
requests = Counter(
    "hcm_requests_total", "HTTP requests", ["service", "method", "status"]
)
latency = Histogram("hcm_request_seconds", "HTTP request duration", ["service"])


class Base(DeclarativeBase):
    pass


class TenantRow:
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)


class Audit(TenantRow, Base):
    __tablename__ = "audit"
    actor: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(100))
    resource: Mapped[str] = mapped_column(String(100))
    trace_id: Mapped[str] = mapped_column(String(36))
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    details: Mapped[dict] = mapped_column(JSON, default=dict)


security = HTTPBearer(auto_error=False)


def principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
):
    if credentials is None:
        raise HTTPException(401, "Authentication required")
    try:
        claims = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=["HS256"],
            audience="hcmflow",
            issuer="hcmflow-identity",
            options={
                "require": ["exp", "iat", "sub", "tenant_id", "roles", "iss", "aud"]
            },
        )
        uuid.UUID(claims["tenant_id"])
        uuid.UUID(claims["sub"])
        if not isinstance(claims["roles"], list):
            raise ValueError()
        return claims
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, "Invalid or expired session")


def require(p, *roles):
    if not set(p["roles"]).intersection(roles):
        raise HTTPException(403, "Permission denied")


def scope(db, tenant):
    if engine.dialect.name == "postgresql":
        db.execute(
            text("SELECT set_config('app.tenant_id', :tenant, true)"),
            {"tenant": tenant},
        )


def database(p=Depends(principal)):
    with Session() as db:
        scope(db, p["tenant_id"])
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise


def audit(db, p, action, resource, request=None, **details):
    db.add(
        Audit(
            tenant_id=p["tenant_id"],
            actor=p["sub"],
            action=action,
            resource=str(resource),
            trace_id=getattr(
                getattr(request, "state", None), "trace_id", str(uuid.uuid4())
            ),
            details=details,
        )
    )


def owned(db, model, id, p, lock=False):
    q = select(model).where(model.id == id, model.tenant_id == p["tenant_id"])
    if lock:
        q = q.with_for_update()
    row = db.scalar(q)
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


def fingerprint(data):
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()


def application(title):
    app = FastAPI(
        title=title,
        version="0.1.0",
        docs_url="/docs" if ENVIRONMENT != "production" else None,
    )

    @app.exception_handler(IntegrityError)
    async def conflict(request, exc):
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Conflicting or concurrently modified record; refresh and retry"
            },
        )

    @app.middleware("http")
    async def observe(request: Request, call_next):
        start = time.monotonic()
        request.state.trace_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.trace_id
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        requests.labels(SERVICE, request.method, str(response.status_code)).inc()
        latency.labels(SERVICE).observe(time.monotonic() - start)
        log.info(
            json.dumps(
                {
                    "service": SERVICE,
                    "trace_id": request.state.trace_id,
                    "status": response.status_code,
                    "duration_ms": round((time.monotonic() - start) * 1000),
                }
            )
        )
        return response

    @app.get("/health")
    def health():
        with Session() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok", "service": SERVICE, "environment": ENVIRONMENT}

    @app.get("/metrics", include_in_schema=False)
    def metrics():
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.get("/audit")
    def history(p=Depends(principal), db=Depends(database)):
        require(p, "admin", "auditor", "approver")
        return db.scalars(
            select(Audit)
            .where(Audit.tenant_id == p["tenant_id"])
            .order_by(Audit.at.desc())
            .limit(200)
        ).all()

    return app
