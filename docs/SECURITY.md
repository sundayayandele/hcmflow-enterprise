# Security and production boundary

## Staging controls

Authenticated tenant membership is bound to a short-lived signed token. No client tenant header can switch scope. Roles are checked at endpoints. Employee own-record reads restrict unprivileged users to their linked worker ID (unlinked users see none). Tenant predicates and FORCE RLS protect workforce/payroll DB reads and writes. Schema owners differ from runtime roles. Runtime audit grants permit SELECT/INSERT but deny UPDATE/DELETE/TRUNCATE. Unique constraints prevent duplicate tenant-local employee codes, import digests and run idempotency keys. Runs lock before approval; a maker cannot check their own result. Production finalization is disabled without an override flag.

Employee profile payloads are Fernet-encrypted; employee codes, tenant/record IDs and source/effective metadata remain plaintext. Imports are encrypted at rest after validation. Payroll snapshots minimize names/emails but contain compensation amounts in PostgreSQL; use encrypted host volumes and encrypted off-site backups before production. No bank account, tax ID, RSA PIN or NIN input is accepted in this initial schema. Add per-field encryption, audit-on-read and retention rules before introducing identifiers. This is data minimization, not complete enterprise sensitive-data handling.

Sessions stay in browser memory, never localStorage. Privileged local passwords require 16+ characters at provisioning, Argon2 hashes, generic login failures and a small single-replica IP attempt limit. Headers deny frames and prevent MIME sniffing. Edge limits request size. Management endpoints are internal. No public DB, metrics or service ports are published. Staging ingress binds loopback only. Diagnostic logs exclude request URLs/parameters, credentials and payloads; business audit stores actions/opaque IDs and non-sensitive counts/checksums.

## Required production hardening

- OIDC/MFA, asymmetric token verification, per-service identities, immediate user/session revocation, scoped entity/team/sensitivity grants and audited user lifecycle UI. Shared HS256 staging secrets trust every verifier to mint tokens and are not a production boundary.
- Central rate limiting, brute-force monitoring, reviewed cookies/CSRF if switching to cookie sessions, access/export audits including sensitive reads, support break-glass and periodic access review.
- Versioned reviewed Nigerian legal rule packs, independent approvals with evidence, reviewed applicability and per-scenario expected results. Keep production calculator disabled until implemented and certified for the pilot facts.
- GTBank authorized specification, sensitive beneficiary data management, reconciled outputs, duplicate prevention, independent transmission approval and correction workflow.
- Per-environment secrets vault, least privilege, encrypted disks, key rotation/recovery, private object storage, malware scanning and attachment authorization before file features.
- Independent WORM/tamper-evident audit retention; DB administrators can alter local audit history. Current snapshots are immutable through APIs, not protected against DB administrators.
- Dependency/image/secret scans, production threat model and penetration review, data processing/retention agreements, privacy review and incident process.

Do not put production employee data in GitHub Pages, CI artifacts, runner logs, issues or staging. Browser demo controls are UI demonstrations only. API permissions are authoritative. GitHub Pages publication exposes synthetic assets only and does not change source repository visibility.


## Enrichment controls

Workplace payloads (including candidate, case, claim and scenario details) are Fernet-encrypted in the new service store. Tenant IDs, opaque subjects/actors, kinds, states and versions remain plaintext for authorization/indexing. New tables use FORCE RLS; runtime audit modification is denied. Employee reads and transitions enforce own-record or explicit category roles; disciplinary records are HR-only. Financial approval never marks a claim paid or a benefit enrolled. Operator linking, tenant-wide HR/finance roles and shared staging keys remain limited pilot controls; they are not a replacement for production delegated scopes and identity hardening.
