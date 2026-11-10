# Enrichment implementation · first increment · 10 November 2026

All eight requested areas now have an implementation increment. This is the beginning of the enrichment programme, not feature parity with the selected competitors and not a production payroll release.

## Delivered and deliberately outstanding

| Area | Implemented increment | Remaining release work |
|---|---|---|
| 1. Production Nigerian payroll | Draft statutory-evidence register with independent metadata review; payroll comparison; downloadable simulation snapshot/audit evidence; historical workforce lookup | Independently validated executable country pack, legally applicable scenarios, specialist certification, final payslips, corrections/reversals, real bank/statutory acceptance. Evidence review never enables production calculations. |
| 2. Trusted employee records | Version-checked, effective-dated Core HR amendments; encrypted previous/current snapshots and amendment reasons; dated lookup and history; imported-source overwrite rejection | Approved imported-record reconciliation, source switching, legal-entity/position history, sensitive identifier lifecycle, source update mapping and batch rollback. |
| 3. Everyday employee experience | Linked employees can submit own leave/time/service workflows; HR/checker decisions, calendar-day leave allocation, overlap/balance checks and atomic approval debit | Full profile-change portal, manager/team scopes, holidays, accruals, fractional/working-day policies, payroll input projections, attendance devices, notifications and delegation. |
| 4. Employee lifecycle | Candidate pipeline; onboarding/exit checklists with all-tasks completion gate; HR-only disciplinary workflow; per-action audit | Requisitions, interview scheduling, candidate retention, offer documents, identity-preserving conversion, multi-owner assignment, evidence uploads, appeals, account closure and final pay. “Hired” is a pipeline state, not an automatic worker conversion. |
| 5. Talent and development | Goal lifecycle; learning assignments and separate completion verification | Full performance cycles, ratings/calibration, skill verification, LMS integration, succession and career planning. A learning verification is an internal workflow decision, not external certificate validation. |
| 6. Finance and benefits | NGN expense claims with receipt reference and independent approval; benefit request approval; scoped approved-claim totals | Receipt uploads/scanning, policy engines, reimbursement/payroll/GL handoff, benefit eligibility, provider enrollment, loans and financial-service integrations. Approved is not paid or enrolled. |
| 7. Enterprise controls | New service/database/runtime role with FORCE RLS; encrypted workflow/scenario payloads; role/own-record visibility; versioned decisions; access-policy and audit views; operator employee linkage | OIDC/MFA, immediate revocation, service identity, delegated team/entity scopes, user lifecycle GUI, workflow definition versioning, durable outbox, off-site recovery and independent audit retention. |
| 8. Analytics and planning | Live role-filtered workflow counts/approved claim totals; immutable staffing scenarios using explicit headcount and average-cost assumptions | Governed historical read models/warehouse, report builder, dimensional permissions, workforce forecasts, compensation budgets and integrations. Scenarios are not statutory or salary forecasts. |

## Architecture and ownership

The existing identity, workforce and payroll services retain their databases and ownership. A fourth `workplace` FastAPI service owns the new pilot workflows and scenarios in a separate PostgreSQL database. Its `workplace_domain.py` module declares typed workforce-operations, lifecycle, talent and employee-finance schemas, role rules and state machines. Shared workflow persistence is intentional for this initial small deployment; split these domains into separate deployables when workload or ownership warrants it. No service reads another service’s tables.

Workplace validates employee references through the workforce lookup API using the authenticated actor’s tenant-bound token. That lookup exposes employee IDs/codes/names without compensation. Personal workflow reads are limited to the linked employee; restricted disciplinary cases are HR-only. Finance, recruiter and talent roles have explicit category access. The `approver` role may review leave/time/expense/benefit requests. Approval of one’s own submission is denied, even when the maker has a privileged role.

New requests have tenant-local idempotency keys and input fingerprints. Decisions carry expected versions and lock the record before applying state changes. Leave approval also locks the allocated balance, checks availability and debits once. Concurrent approval attempts yield one success and one stale-state/version conflict. Checklist completion requires all tasks to be marked done. No endpoint can transmit a payment or activate statutory production rules.

## Employee history semantics

The initial employee snapshot stays encrypted and unchanged. Amendments are full, encrypted revisions with a reason, actor, unique effective date and revision number. The employee version counter detects stale edits; `record_version` identifies the effective snapshot. Reads default to the Africa/Lagos business date (`BUSINESS_TIMEZONE` can override the staging default); `as_of` selects the latest applicable revision. Future-dated changes do not silently replace current values. Imported employee amendments are rejected pending the separate source reconciliation workflow.

Payroll requests the workforce snapshot at the pay-period start and checks for amendments later in the period. Such mid-period changes are rejected until reviewed proration/correction behaviour exists. Period base amounts remain explicit operator inputs. Existing payroll results are never recomputed in place after an employee amendment.

## API entry points

All routes below are authenticated and tenant scoped under the existing `/api` ingress.

- Workforce: `GET /workforce/employees?as_of=YYYY-MM-DD&period_end=YYYY-MM-DD`; `GET /workforce/employees/lookup`; `POST /workforce/employees/{id}/amend`; `GET /workforce/employees/{id}/history`.
- Payroll: `GET/POST /payroll/rule-evidence`; `POST /payroll/rule-evidence/{id}/review`; `GET /payroll/runs/{id}/comparison?baseline_id=...`; `GET /payroll/runs/{id}/evidence-pack`.
- Workplace: `GET/POST /workplace/items`; `POST /workplace/items/{id}/transition`; `POST /workplace/items/{id}/tasks`; `GET/POST /workplace/leave-balances`; `GET /workplace/access-policy`; `GET /workplace/audit`; `GET /workplace/insights`; `GET/POST /workplace/plans`.
- Identity: `GET /identity/access-profile`; operator CLI accepts `--employee-id` and finance/recruiter/talent roles. No new public privilege-grant endpoint is introduced.

OpenAPI is available inside the Compose network in staging and remains blocked at the edge. The employee link must be verified against the correct tenant by the provisioning operator. Existing tokens do not acquire a new link until a fresh sign-in.

## GUI and demo review

Open **Enrichment hub** in the React workspace. Eight tabs correspond to the areas above. The Pages demo uses synthetic browser-memory records; role switching through the bottom-left profile demonstrates separate maker and reviewer actions. The backend remains the authority for real authorization. Changes persist when switching workspace pages but reset on browser refresh.

Suggested review:

1. In Daily HR allocate calendar-day leave, submit a request, observe self-review rejection, then switch demo profile and approve it.
2. In Employee lifecycle, start the onboarding checklist and complete all tasks before closure; move a candidate through human-selected stages.
3. In Talent & learning, request completion and switch reviewer to verify it.
4. In Finance & benefits, approve a synthetic claim as a different reviewer; confirm it is not shown as paid.
5. In Payroll assurance create an evidence draft, review it independently and confirm production remains disabled. Create two previews in Payroll to compare or download evidence.
6. In People history amend a Core HR record with a later effective date and inspect prior values. Imported-source updates remain blocked.
7. Review access policy/audit metadata and create a staffing scenario with explicit assumptions.

## Upgrade and rollback

This change adds tables rather than altering existing employee/payroll table layouts. The explicit migration command creates the new tables and applies RLS/grants. It remains a bootstrap/additive migration tool; introduce numbered Alembic revisions before more complex schema upgrades.

For an existing **staging** stack, preserve volumes and back up configuration/data before upgrading:

```sh
python scripts/configure.py --extend  # append only missing workplace credentials
COMPOSE_BAKE=false docker compose build
docker compose up -d --wait postgres
# Safe rerun: creates only missing service roles/databases; preserves existing passwords/data.
docker compose exec -T postgres sh /docker-entrypoint-initdb.d/01-hcmflow.sh
sh scripts/migrate.sh
docker compose up -d --wait
```

For a new stack use the normal README setup; initialization creates all four service databases. Never use `down -v` against customer data. Old code can be restored while retaining the additive tables; review any intervening amendments/workflows before switching versions. Never delete employee revisions to undo a business decision. Re-run an isolated backup/restore rehearsal and scope/approval checks after any rollback.

Link an employee account through the existing operator provisioning command:

```sh
docker compose run --rm identity python -m hcm.cli provision \
  --tenant lagos-pilot --name 'Lagos Pilot' --email employee@example.invalid \
  --roles employee --employee-id '<verified-employee-UUID>'
```

Enter a password through the private CLI prompt; do not put it in a command or repository. No live employee or banking data belongs in Pages, CI artifacts or synthetic staging.

## Verification

API tests cover cross-tenant/own-record visibility, idempotency conflicts, leave balance/overlap constraints, independent decisions, state transitions, checklist closure, learning verification, finance/case separation, scenario arithmetic, employee effective history and non-production evidence review. Browser tests exercise all eight areas, profile switching, page navigation persistence and mobile layouts. CI smoke adds real PostgreSQL checks for new-table FORCE RLS and concurrent approval, historical workforce snapshots and the unchanged production gate. The disposable logical restore drill now covers all four service databases and checks representative record counts and data fingerprints. It still does not establish off-site recovery or key escrow. See Actions for per-commit execution evidence.

## Tracked enrichment epics

- [1. Payroll assurance and validated Nigeria country pack](https://github.com/sundayayandele/hcmflow-enterprise/issues/6) — initial increment delivered; remaining scope open.
- [2. Employee history and controlled mixed-source migration](https://github.com/sundayayandele/hcmflow-enterprise/issues/7) — initial increment delivered; remaining scope open.
- [3. Employee self-service and daily HR workflows](https://github.com/sundayayandele/hcmflow-enterprise/issues/8) — initial increment delivered; remaining scope open.
- [4. Recruitment and complete employee lifecycle](https://github.com/sundayayandele/hcmflow-enterprise/issues/9) — initial increment delivered; remaining scope open.
- [5. Talent, performance and learning development](https://github.com/sundayayandele/hcmflow-enterprise/issues/10) — initial increment delivered; remaining scope open.
- [6. Finance, expenses and benefits integrations](https://github.com/sundayayandele/hcmflow-enterprise/issues/11) — initial increment delivered; remaining scope open.
- [7. Enterprise identity, scoped controls and assurance](https://github.com/sundayayandele/hcmflow-enterprise/issues/12) — initial increment delivered; remaining scope open.
- [8. Governed insights and workforce planning](https://github.com/sundayayandele/hcmflow-enterprise/issues/13) — initial increment delivered; remaining scope open.
