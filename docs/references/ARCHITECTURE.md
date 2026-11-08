# HCMFlow Enterprise Architecture and Technology Decisions

**Status:** Proposed · **Revision:** 0.2 · **First payroll jurisdiction:** Nigeria

## 1. Architectural goals

1. Deliver a dependable HCM system of record with auditable workflows.
2. Keep tenant and sensitive-data boundaries explicit in every service and data path.
3. Support a shared multi-tenant SaaS cell and a future dedicated-client deployment from the same deployable artifacts.
4. Make Nigerian payroll rules, integrations and customer-specific workflows configurable without forking application code.
5. Keep the first deployment operable on a small VPS while providing a clear path to replicated services and managed infrastructure.

## 2. Proposed stack

| Layer | Proposal | Notes |
|---|---|---|
| Web | React + TypeScript + Next.js | Modular application with shared navigation/design system. Avoid micro-frontends until independent frontend teams need them. |
| UI system | MUI or Ant Design with HCMFlow Enterprise design tokens | Accessible data grids, forms, approval queues and responsive employee surfaces. Validate licensing and localization needs before selection. |
| API | Python + FastAPI + Pydantic + SQLAlchemy | REST/OpenAPI for transactional APIs; async workers for imports, reports, notifications and long jobs. |
| Identity | Keycloak or customer OIDC | OIDC, MFA, federation and role claims; application remains authoritative for fine-grained HR scopes. |
| Transaction store | PostgreSQL | Database/schema ownership aligned with services; RLS as defense in depth for shared tenant data. |
| Cache | Redis-compatible store | Cache, rate limits, short-lived coordination; no authoritative HR/payroll records. |
| Messaging | RabbitMQ for initial task/workflow delivery; Kafka only when event replay/volume justifies it | Transactional outbox, idempotent consumers, retry and dead-letter queues. Keep contracts technology-neutral. |
| Files | S3-compatible object storage | Private buckets, tenant-scoped keys, encryption, malware scanning, retention and signed short-lived access. MinIO can be used for self-hosted pilot; independent backup required. |
| Gateway/ingress | Traefik or Nginx; managed WAF/CDN when available | TLS termination, routing, request limits, safe headers and API throttling. |
| Workflow | Versioned application workflow service initially | External workflow engine can be adopted when long-running workflows, timers and version migration exceed in-house simplicity. |
| Search | OpenSearch for logs and limited user search projections | Never sole source of record; index minimum necessary PII and enforce tenant filters/security. |
| Observability | OpenTelemetry SDKs/Collector, Prometheus, Grafana, OpenSearch; Tempo for traces if adopted | OTel semantic attributes and correlation IDs; avoid sensitive HR values in telemetry. |
| Deployment | Docker Compose for single-host pilot; Kubernetes when availability/scale/team needs justify it | Build OCI images once; promote the same immutable image through environments. |

## 3. Domain boundaries and ownership

Start with a small number of deployable services, but keep code organized by domain. Do not create a network service for every table or module.

| Service / domain | Owns | Publishes/consumes (examples) |
|---|---|---|
| Tenant & access | Tenant, legal entities, membership, policy configuration, role/scope grants | `TenantProvisioned`, `MembershipChanged` |
| People & organization | Person, worker/employment, job, position, org hierarchy, lifecycle | `WorkerHired`, `WorkerChanged`, `WorkerTerminated` |
| Workforce operations | Leave, time events, attendance, schedules, holidays | `LeaveApproved`, `TimeEntryApproved`, consumes worker/org snapshots |
| Talent acquisition | Requisitions, candidate, application, interview, offer, checks | `OfferAccepted`, `CandidateStageChanged` |
| Talent development | Goal, review, skill, learning, career and succession records | `ReviewCompleted`, `SkillVerified`, consumes worker/job events |
| Payroll & rewards | Pay groups, inputs, calculations, run, compensation/benefit enrollment | `PayrollRunFinalized`, consumes approved time/leave and worker changes |
| Employee service | Case, request, knowledge, communication, notifications | `CaseOpened`, notification jobs |
| Platform/integration | Workflow definitions, audit event envelope, documents metadata, integration connectors | Outbox, webhooks, provider delivery state |
| Analytics/read models | Governed read models and aggregate reporting | Consumes versioned events; no writes to domain stores |

Identity and workforce records are related but distinct. People service owns the worker record; identity service owns login credentials; payroll owns pay calculations. Services exchange stable opaque IDs, not shared database tables. A service may hold a minimized, versioned projection when needed to operate independently.

## 4. Multi-tenancy and hosting modes

### Shared SaaS cell

- Tenant is resolved from the authenticated membership and trusted host/domain mapping, never from an unchecked query/header.
- Every tenant-owned row carries tenant ID and composite keys/constraints prevent accidental cross-tenant joins.
- Apply PostgreSQL RLS to suitable shared tables as defense in depth. Application services set tenant context transactionally; pool connections must reset context before reuse.
- Cache keys, queue messages, search documents, exports, object keys and scheduled jobs include tenant scope and are validated by the owning service.
- Default data partitions can share a regional PostgreSQL cluster; use tenant-level encryption keys or envelope encryption for high-sensitivity material where operations support it.
- Support staff receive metadata-only operational access by default. Just-in-time data access is time-limited, approved, reason-coded and audited.

### Dedicated client cell

Use the same OCI images/configuration with a dedicated database, object store namespace/bucket, secrets, encryption key set, hostname and isolated runtime/network policy. For strict requirements, place the whole cell in a separate VPS/project/account and region. Automate provisioning and upgrades; avoid custom source forks. Shared SaaS is the default; dedicated-client hosting is an isolation tier.

### Single-tenant deployment

For a customer-hosted or isolated environment, package the same product as a named tenant deployment: app/API, workers, database, cache/broker, file storage and telemetry. Customer-managed identity and secrets are supported through adapters. Define a supported upgrade cadence; do not promise arbitrary infrastructure diversity.

## 5. API, events and consistency

- REST/OpenAPI for synchronous operations; webhooks and versioned events for cross-domain changes.
- Publish transactional events through an outbox written in the same transaction as the domain change. Consumers use idempotency keys and record processed message IDs.
- Include `event_id`, `event_type`, `schema_version`, `occurred_at`, `tenant_id`, `actor_id` or service identity, correlation/trace ID and source aggregate ID. Do not include unnecessary PII.
- Use eventual consistency for projections; show clear pending status to users. Payroll finalization, leave balance and employment-state changes need explicit transaction boundaries and reconciliation.
- Retry transient errors with bounded exponential backoff; dead-letter and alert on poison messages; provide a controlled replay mechanism.
- API write operations support idempotency where client retries could duplicate payroll runs, expenses, imports or lifecycle events.

## 6. Security, privacy and audit

- OIDC/OAuth, MFA for privileged operations, short-lived access tokens, service identity and managed secrets.
- Authorization checks at API/service boundary for every resource and action. Deny by default, with explicit scope inheritance and separation of duties.
- Database least privilege; separate runtime, migration and reporting identities. No direct public database ports.
- Encrypt traffic and storage; rotate keys; redacted structured logs; secret scanning and dependency/image scanning in CI.
- Immutable/versioned audit records for employee, payroll, access-control, document, integration and export events. Protect audit retention against ordinary tenant-admin deletion.
- Treat analytics/search indexes as derived data with minimum necessary fields, tenant filters, retention and rebuild procedures.
- Maintain data classification, retention/deletion workflows, data-subject request process, breach response, subprocessors list and jurisdiction review before production.
- AI features are opt-in per tenant, source-grounded, permission-aware, monitored for data leakage and require human confirmation for consequential actions.

## 7. Observability design

Instrument FastAPI, workers, gateway and database clients with OpenTelemetry. Collect traces, metrics and structured logs through a local OTel Collector or agent. Export metrics to Prometheus; traces to Tempo (proposed) or another supported trace backend; logs to OpenSearch. Grafana is the operator-facing metrics/trace dashboard and can query OpenSearch for logs.

Required labels: service, environment, version, region/cell, route template, result class and tenant-safe aggregate identifiers. Do not use employee ID, email, candidate name or tenant IDs as high-cardinality metric labels. Store tenant-specific operational identifiers in access-controlled logs only when needed. Keep business audit events separate from diagnostic logs; OpenSearch retention is not the audit system of record.

Key dashboards/alerts:

- **Golden signals:** request rate, error rate, latency and saturation by service/route.
- **PostgreSQL:** connections, lock waits, replication lag (when HA), disk growth, slow queries and backup/PITR age.
- **Queue/workers:** queue depth, oldest message age, retry/dead-letter count, task duration and worker availability.
- **Tenancy/security:** denied cross-scope requests, repeated auth failures, unusual exports, admin changes and support break-glass access.
- **HCM workflows:** stuck approvals, failed imports, payroll run exceptions/failures, notification delivery failures and integration lag.
- **Infrastructure:** CPU, memory, disk/inode, network, certificate expiration, container restarts and external synthetic checks.

## 8. Deployment and environments

- Separate development, test/staging and production credentials/data. Use synthetic or masked data outside production.
- CI builds signed/versioned images, runs dependency/security scans and unit/integration/contract checks, then produces an SBOM. Promotion uses the same image digest.
- Database migrations are forward-compatible expand/migrate/contract; take and validate backup before high-risk migration; record migration state.
- Production deployment uses staged rollout/health checks, a rollback path and migration compatibility review.
- Config and secrets are injected at runtime from a secrets system; never committed to Git.
- Infrastructure definitions are version-controlled; application supports Compose for pilot and a later Kubernetes deployment profile.

## 9. Architecture decisions to confirm

1. Confirm latency from Nigerian customer networks to SSD Nodes Frankfurt, Amsterdam, London and available US East locations. Frankfurt is provisional; routing quality can outweigh physical distance.
2. Confirm whether the first Nigeria payroll pilot calculates payroll in HCMFlow Enterprise or integrates with a local payroll provider.
3. Keycloak versus managed OIDC provider, and whether customer SSO is a launch requirement.
4. RabbitMQ first versus Kafka first. Recommendation: RabbitMQ for early task/workflow needs; add Kafka only for demonstrated event-streaming needs.
5. OpenSearch retention and whether full application log search is required for the pilot.
