# Setup, deployment, backup and rollback

## Current hosting status

VPS deployment is deferred by the user. GitHub Actions starts temporary staging containers, runs acceptance checks and destroys containers/volumes/secrets. GitHub Pages hosts only the synthetic browser demo; it has no backend/database. Neither is persistent API hosting.

Private source repository: `sundayayandele/hcmflow-enterprise`. In repository Settings → Pages choose GitHub Actions as source. If private-repository Pages is unsupported by the account plan, upgrade/enable eligible Pages or explicitly authorize a separate public **demo-only** repository; never make this source repository public as a workaround. GitHub connection may require Pages administration permission for API configuration; owner settings are the fallback. No secrets are needed for the static demo workflow.

## Future VPS staging deployment

1. Confirm the dedicated host, SSH user/port, verified SSH host-key fingerprint, staging DNS and region. Verify that this is isolated from unrelated deployments. Obtain private access through environment secret bindings, not chat.
2. Patch the host, restrict SSH to VPN/allowlist/key auth, enable firewall with only 80/443 public, encrypted data disk and sufficient free storage. Install supported Docker/Compose and age. Confirm outbound backup storage and alert routing.
3. Clone the private repository using a read-only deploy credential. Pin a tested release commit, build images in CI and promote the same signed image digests before production. Current Compose builds from source; immutable registry promotion is backlog OPS-03.
4. Generate `.env` with `python scripts/configure.py` on the target. Keep separate secrets/data for staging and production. Store encryption keys and secrets backup separately. Never copy local demo `.env` or production data into CI.
5. Build images, start only PostgreSQL, run explicit migrations, start application and confirm health. Provision separate maker/checker users. Run synthetic acceptance tests. No production calculation sign-off is implied by passing technical tests.
6. Replace the loopback Caddy binding with confirmed public 80/443 through a reviewed deployment override. Use the confirmed domain with Caddy automatic HTTPS. Copy the **body** of `deploy/Caddyfile` into a routes file imported by `deploy/Caddyfile.https`; mount persistent `/data` and `/config` Caddy volumes. DNS must resolve and certificate issuance/renewal must pass before sharing. An executable HTTPS template is below.
7. Configure encrypted off-site backups and restore rehearsal, external uptime, disk/inodes, DB connection/storage, certificate expiration, container health, backup age/failure and alert delivery. Optional Prometheus profile only includes app metrics and example service/error/latency rules; it does not implement infrastructure/backup alerts or alert delivery. No recovery or availability SLO is asserted.

```sh
# After domain and host confirmation, edit STAGING_DOMAIN in the ignored target .env.
docker compose -f compose.yaml -f compose.https.yaml up -d --wait
```

`compose.https.yaml` clears the loopback port mapping and publishes 80/443. Its Caddy template duplicates the safe routing configuration to make deployment reviewable. Never run it without a confirmed domain and public ingress authorization.

## Migrations

Initial schema is created by `python -m hcm.cli migrate` under the owning migration role; `scripts/migrate.sh` uses a short-lived Compose override. Application service credentials cannot create schemas or modify audit rows. This bootstrap migration is idempotent, not a general schema migration framework. Before subsequent schema changes add numbered Alembic revisions with expand/migrate/contract strategy and compatibility tests. Never assume `create_all` upgrades an existing table.

## Backup / restore

`AGE_RECIPIENT` is a public age encryption key whose private recovery key is held separately. On the host run `AGE_RECIPIENT=age1… sh scripts/backup.sh`; it streams a full cluster dump directly into an encrypted file, checks pipeline failures and keeps local files private. It includes roles/password hashes and all three databases. Copy the encrypted file to separately credentialed off-provider storage, verify its hash remotely, and alert on age/failure. Schedule at least daily after retention and off-site destination are agreed. Current script is on-demand and does **not** claim an automated off-site backup or PITR.

Recover on a fresh isolated host with compatible PostgreSQL major version:

1. Restore encrypted `.env`/PII key/JWT and migration credentials from independent secure escrow. A database without its PII key cannot decrypt profiles. Rotate compromised keys as part of an incident plan.
2. Start a clean PostgreSQL container without the initialization script that creates application roles/databases. Never run a full-cluster restore into a live populated cluster.
3. Stream `age --decrypt --identity <secure-key-path> <backup.sql.age>` into `psql -v ON_ERROR_STOP=1 -U postgres` on the clean cluster. Handle the bootstrap postgres role explicitly when restoring `pg_dumpall`; remove/reconcile that preexisting role under operator review. Validate role ownership, grants and FORCE RLS.
4. Deploy compatible application images and keys, verify all tenant record counts and audit/run checksums, decrypt synthetic fixtures, exercise user login/authorization and a synthetic payroll preview. Measure restore duration and data loss against backup timestamp.
5. Review and approve cutover; preserve old data read-only until acceptance and never replay bank payments automatically.

CI `scripts/restore-drill.sh` creates a **disposable database** from workforce `pg_dump`, verifies row counts and drops it. This proves a limited logical restore path, not disaster recovery of keys, all services, encryption, or off-site copies. Before production rehearse full encrypted off-site restore. Without tested WAL/PITR, daily backup implies up to 24h data loss, not a 15-minute RPO. No four-hour RTO is promised until demonstrated.

## Rollback

Record release SHA/image digests, schema version and configuration fingerprint before deploy. Take a verified independent backup before high-risk migration. For code-only changes, restore previous compatible images/commit and `docker compose up -d --wait`; preserve PostgreSQL volumes and secrets. Never `down -v` on customer data. If schema changed, assess backward compatibility and prefer a forward fix; restore a pre-change backup only into a new isolated cluster with explicit cutover approval, reconciliation of intervening writes and measured data-loss impact. Never unfinalize payroll or regenerate a payment instruction silently. CI teardown with `down -v` is for throwaway synthetic runner data only.

## Monitoring and incidents

`docker compose ps`, `/api/{service}/health` and internal `/metrics` support health review. Logs are rotated JSON without request bodies/credentials. Alert-rule templates cover down services, server error rate and p95 latency; integrate notification delivery before relying on them. Collect only redacted diagnostics. Tenant audit is separate from diagnostic logs. Payroll snapshot outages produce 503 without creating a run. On security/recovery failure disable write access, retain evidence and consult incident owners; do not bypass statutory gates to finish a run.
