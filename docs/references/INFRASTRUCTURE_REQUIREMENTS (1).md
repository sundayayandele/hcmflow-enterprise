# HCMFlow Enterprise Multi-Tenant Infrastructure Requirements

**Status:** Proposed pilot design · **Revision:** 0.2 · **Scope:** New isolated SSD Nodes VPS · **First payroll jurisdiction:** Nigeria

## 1. Deployment objective and limits

Provide an isolated, supportable pilot environment for multiple customer tenants, initially sized for a design partner with fewer than 200 employees and a Nigeria-first payroll roadmap. Use shared SaaS tenancy by default, with a dedicated-client deployment tier available later. A VPS is a practical starting point for a controlled pilot; it is not a multi-host high-availability architecture. Do not promise contractual high availability until backup, restore, security, capacity and failure recovery have been proven.

Use a **fresh, dedicated project/VPS** for HCMFlow Enterprise rather than placing customer HR data on the user's existing mixed-use host that also runs unrelated services. Keep staging separate from production. Use separate credentials, encryption keys, storage and backups for each environment.

## 2. Hosting choices

### Option A — Hetzner Cloud

Select a European location such as Falkenstein, Nuremberg or Helsinki if the initial customer data-residency decision allows it. Hetzner documents Cloud locations across Europe, North America and Singapore, plus private Networks, firewalls, load balancers, backups and volumes. Networks are private server-to-server links; verify all selected resources share a compatible network zone. Hetzner states that its automatic server backups/snapshots do not include attached Volumes, so separately back up persistent volume data.

**Best initial fit:** predictable cloud primitives and straightforward private networking for a small multi-node pilot. Keep database/object data in-region and test the recovery path in another location or provider.

### Option B — SSD Nodes VPS

SSD Nodes documents Linux KVM VPS, NVMe storage, multiple locations, SSH-key protection, automatic snapshots and backups. Its snapshot API documentation states that snapshots are stored on the same node as the VM; treat those as fast rollback copies, not the only disaster-recovery copy. Confirm the current plan's actual resource limits, backup retention, network isolation options, API access and support SLA before use.

**Selected starting provider:** SSD Nodes, on a new isolated VPS. The HCMFlow marketing website remains on Hostinger; keeping the app separate isolates the customer data plane from the marketing site.

**Provisional region: Frankfurt, Germany.** One published Lagos-to-Europe measurement set shows Frankfurt around 98 ms, Amsterdam around 104 ms and London around 109 ms. These are indicative results from other networks, not a guarantee for SSD Nodes. Nigerian ISP/mobile routes and provider peering can change the ranking. Before purchase, test ping, TCP/TLS handshake, traceroute/MTR, packet loss and jitter from at least two Nigerian networks to SSD Nodes endpoints in Frankfurt, Amsterdam, London and available US East locations. If test IPs are unavailable, use the smallest disposable VPS in candidate locations during a trial. Do not choose a US location unless direct tests show a meaningful improvement or customer geography requires it.

### Provider-selection rule

Choose based on the selected customers' data-residency and support needs, documented backup/restore controls, network isolation, failure recovery, and operational familiarity. Do not choose based only on advertised vCPU/RAM or provider snapshot count. Provider snapshots are useful for rapid rollback; independent encrypted backups are required.

## 3. Tenant hosting models

### Model 1: Shared SaaS cell (recommended default)

Multiple customer tenants share stateless APIs/workers and regional services. Every tenant-owned record is tenant-scoped, authorization checked, and isolated by database policies and tests. Object storage uses private tenant prefixes or buckets; queue/search/reporting paths also validate tenant context.

Minimum safeguards:

- Authenticated tenant membership and server-side tenant resolution.
- PostgreSQL RLS for shared tables where appropriate, plus application authorization.
- Tenant-safe cache, queue, search, file, webhook, export and scheduled-job keys.
- Tenant-aware rate limits, quotas, logging access and data retention.
- Cross-tenant negative tests and periodic access review.

### Model 2: Dedicated tenant cell

One customer has dedicated app/worker instances and database, storage, secrets and encryption key set. This is the upgrade tier for contract, risk, scale or residency needs. Same software images and automated deployment templates must be used; no customer code forks.

### Model 3: Customer-hosted / single tenant

Deploy a documented isolated stack in a customer-controlled account or supported VPS. Define minimum versions, backup responsibilities, upgrade windows, security patch process, support boundary and telemetry sharing. The customer controls data and keys according to the agreement.

## 4. Pilot capacity profiles

These are planning estimates, not provider plan names or guaranteed sizing. Actual sizing depends on concurrent users, data retention, report workload, payroll cadence, attachments and OpenSearch ingestion. Load-test with anonymized representative data before onboarding more tenants.

| Profile | Suggested resources | Intended use | Placement |
|---|---:|---|---|
| Developer sandbox | 4 vCPU, 8–16 GB RAM, 150–250 GB NVMe | One engineer, synthetic data, Compose | One non-production VPS |
| Private design-partner pilot | 8 vCPU, 32 GB RAM, 400–600 GB NVMe | Few tenants, low concurrency, no production payroll commitment | One dedicated VPS; independent backup target |
| Pilot with separate data plane | App/worker: 8 vCPU/16 GB; DB: 8 vCPU/32 GB; observability: 4 vCPU/16 GB; 500 GB+ SSD/NVMe for DB and 300–500 GB for logs | Stronger workload isolation, modest observability retention | Three VPS nodes on a private network; off-site backup account |
| Early production (minimum HA direction) | 2+ API nodes, 2+ workers, PostgreSQL primary + standby or managed DB, redundant broker/cache, replicated storage, separate observability | Contracted service levels after operational readiness | Multiple failure domains/locations or managed equivalents; no single host dependency |

**Practical starting recommendation:** a clean 8 vCPU / 32 GB / 500 GB NVMe pilot VPS (or equivalent) in Frankfurt, with PostgreSQL and app containers isolated by resource limits, OpenSearch kept small/short-retention or on a separate node, and encrypted off-provider backups. This is a planning profile for a controlled pilot, not a concurrency guarantee. The existing 12 vCPU / 48 GB / 720 GB VPS from prior context should remain non-production or be reserved only for a pilot after isolation; the selected direction is a new VPS.

## 5. Pilot topology and network policy

- Public ingress: DNS + TLS at reverse proxy/WAF; expose only 80/443. Redirect HTTP to HTTPS.
- Private network: application-to-database, broker, cache, object storage and observability traffic stays on private addresses or a protected overlay VPN.
- Admin access: SSH via key and VPN/allowlist; no public PostgreSQL, Redis, RabbitMQ, OpenSearch, Prometheus or Grafana ports.
- Ingress policy: explicit allow-list by service; API rate limits; body-size and timeout limits; security headers.
- App services run non-root with read-only root filesystem where possible, CPU/memory limits, health checks and restart policies.
- Database and stateful services use encrypted persistent storage; never depend on a container writable layer.
- Keep management/control plane isolated from the tenant-facing network. Restrict Grafana and OpenSearch to operator VPN and named accounts with MFA.

## 6. Logical deployment components

1. **Edge:** DNS, TLS, reverse proxy, WAF/rate limiting.
2. **Web/API:** Next.js web app, API gateway, Python domain services.
3. **Workers:** workflow and integration consumers, email, imports, reports, scheduled jobs.
4. **State:** PostgreSQL, Redis, RabbitMQ, private object storage.
5. **Observability:** OTel Collector, Prometheus, Grafana, OpenSearch and trace store (Tempo recommended).
6. **Recovery:** encrypted independent object-storage backup, database PITR/WAL, configuration backup, restore environment.

## 7. Data protection and recovery requirements

- PostgreSQL: continuous WAL/PITR where practical; daily encrypted full/base backup; documented retention by customer contract; independent copy in a separate provider/account or separately credentialed object storage.
- Files: versioning or immutable retention where available; malware scan before user download; independent encrypted object backup; tenant-scoped restore.
- OpenSearch: retain only operational logs needed for support/security; do not back it up as the system of record. Rebuildable indexes should be reconstructed from sources.
- Secrets and infrastructure: encrypted backup of IaC state/configuration; secrets backup must be access-controlled and recoverable separately from the production host.
- Targets proposed for pilot: database RPO ≤ 15 min only if WAL/PITR replication to independent storage is verified; otherwise publish the actual backup interval (e.g. 24 h). RTO target ≤ 4 h only after restore drills demonstrate it.
- At least quarterly restore rehearsal at pilot stage and before every major customer onboarding; record duration, missing dependencies and verification evidence.
- Keep a recovery runbook for host loss, database corruption, credential compromise, ransomware, region unavailability and accidental tenant deletion.
- Provider snapshot and backup products have different coverage. Hetzner documentation says attached Volumes are excluded from server backups/snapshots; SSD Nodes API notes snapshots remain on the VM's node. Verify current provider behavior before purchase or migration.

## 8. Observability and alerting requirements

### Collection and routing

- OTel SDK instrumentation in API, worker and integration services; propagate W3C trace context across HTTP and broker events.
- OTel Collector receives OTLP telemetry, adds environment/service/resource metadata, applies redaction and routes signals.
- Prometheus scrapes Collector-exported/service/node metrics. Grafana provides dashboards and alert views.
- Structured logs route through OTel Collector/agent to OpenSearch. Grafana can link a trace/request ID to matching logs.
- Traces route to Tempo or a chosen trace backend; Grafana provides trace exploration. Trace sampling may be reduced for high-volume health probes.
- Keep security/business audit records in a durable, access-controlled audit store; OpenSearch is not the immutable audit ledger.

### Required alert groups

- **Availability:** external synthetic check failure; API error rate and p95 latency; unhealthy deploy or repeated restarts.
- **Capacity:** CPU/memory pressure, disk/inode threshold, DB connection saturation, storage growth, certificate expiry.
- **Data:** backup/PITR age, backup failure, restore-check failure, replication lag (when used), unusual deletion/export rate.
- **Async work:** oldest message age, queue depth, dead-letter count, worker errors and integration delivery failure.
- **HCM workflows:** import failure, unresolved approval backlog, payroll calculation/reconciliation exceptions, failed payslip generation.
- **Security:** repeated failed login, privilege change, break-glass session, cross-tenant authorization denial burst, unexpected admin/export action.

Alert labels must avoid employee/candidate identifiers and raw tenant ID cardinality. Dashboards can show aggregate tenant health with authorization-controlled drill-down.

## 9. Storage and retention planning

Estimate at least: PostgreSQL data + index growth, document attachments, backup history, log ingestion/day × retention, trace sampling × retention, and container/image cache. Set alerts at 70%/80%/90% disk usage and schedule retention cleanup. Keep OpenSearch retention short in a single-node pilot; memory and disk contention can destabilize the application and database.

Recommended pilot retention starting point (confirm with legal/customer policy): operational logs 14–30 days; traces 3–7 days; metrics 15–30 days; audit records separately governed and longer according to policy/contract. These are planning values, not legal retention advice.

## 10. Growth and separation triggers

Move from one host to separate data/observability nodes before any of these occur:

- OpenSearch ingestion or compaction causes database/app latency or memory pressure.
- Database storage, connection counts or backup duration exceed measured headroom.
- Queue backlog can no longer clear within the workflow's service target.
- A customer contract requires dedicated database, region, encryption key or compute.
- Maintenance windows cannot be met without affecting live users.
- Recovery rehearsal misses the agreed RPO/RTO.
- Ingress, API, worker and stateful layers need independent scaling.

Adopt Kubernetes only when its operational cost is justified by multiple deployment cells, autoscaling, HA or a dedicated platform team. Docker Compose is acceptable for early isolated pilots with strong IaC, backup and upgrade discipline.

## 11. Provider references

- [Hetzner Cloud locations](https://docs.hetzner.com/cloud/general/locations/)
- [Hetzner Cloud network overview](https://docs.hetzner.com/networking/networks/overview/)
- [Hetzner backup/snapshot overview](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/)
- [Hetzner server overview](https://docs.hetzner.com/cloud/servers/overview/)
- [SSD Nodes VPS products](https://www.ssdnodes.com/products/)
- [SSD Nodes data-center locations](https://www.ssdnodes.com/data-center/)
- [SSD Nodes snapshot API](https://www.ssdnodes.com/api-docs/get-all-snapshots/)
- [Zenlayer Lagos latency matrix and looking glass](https://cloud.zenlayer.com/datacenters/lagos)

Provider feature pages and prices can change. Verify the selected plan, location, limits, backup scope and SLA before procurement.
