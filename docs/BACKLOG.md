# Phased implementation backlog

Owners are accountable roles, not assigned people. Estimate and acceptance sign-off with the Lagos design partner before committing dates.

| ID | Phase / priority | Work and acceptance evidence | Owner | State |
|---|---|---|---|---|
| FND-01 | 0 / P0 | Private repo, three owned Python services, React workspace, Compose/CI, documented boundaries | Engineering | Implemented |
| SEC-01 | 0 / P0 | Tenant-bound sessions, role checks, RLS, encrypted profiles, audit writes; cross-tenant negative tests | Engineering | Implemented for synthetic staging |
| HR-01 | 0 / P0 | Core/import populations, CSV/XLSX/XML/JSON preview and atomic new-record commit; duplicate/source rejection | Engineering | Implemented |
| PAY-01 | 0 / P0 | Decimal synthetic calculations, bounded elements, calendar config, immutable snapshots, idempotency and independent approval | Engineering | Implemented; monthly UI subset |
| OPS-01 | 0 / P0 | GitHub runner Compose checks, browser tests, simulation CSVs, disposable restore drill | Engineering | Implemented; verify workflow runs |
| WEB-01 | 0 / P1 | GitHub Pages synthetic GUI; source remains private; no network calls in demo mode | Engineering + repo admin | Workflow prepared; Pages setting required |
| TAX-01 | 1 / P0 | Current Nigeria rule register: sources/clauses, effective dates, population, jurisdiction, exemptions, bases, reliefs, bands, rounding and remittance obligations | Tax adviser | Outstanding |
| TAX-02 | 1 / P0 | Approved country-pack evaluator and separate specialist checker; reject missing/expired approvals; trace every result line | Payroll accountant + engineering | Blocked by TAX-01 |
| TAX-03 | 1 / P0 | Parallel cases: salary, joiner/leaver, unpaid absence, overtime/bonus, retro pay, frequencies, exemptions, deduction caps/negative net; signed expected results and variance closure | Tax adviser + payroll accountant | Outstanding |
| PAY-02 | 1 / P0 | GTBank current channel spec and synthetic acceptance file; exact fields, controls, duplicate prevention, rejected-file handling, secure transfer | Finance + customer bank | Outstanding; no inferred format |
| PAY-03 | 1 / P0 | Finalized immutable payroll; maker-checker snapshots; final PDF payslips, customer GL mappings, balanced journals, validated statutory schedules | Payroll + engineering | Blocked by TAX-02/03 and PAY-02 |
| HR-02 | 1 / P0 | Employee source/field ownership, effective-dated job/comp changes, reconciliation, new-hire/leaver/rehire handling and audit; no overlapping source writes | HR + engineering | Planned |
| SEC-02 | 1 / P0 | OIDC/MFA, asymmetric token validation, membership revocation/user admin, entity/team/sensitivity scopes, service identity, key rotation, penetration review | Security + engineering | Production gate |
| OPS-02 | 1 / P0 | Confirm VPS/domain, TLS, separate production secrets, off-site encrypted backups/retention, restore all DBs plus keys, monitor disk/DB/backup age and route alerts | Operations | VPS deferred by user |
| OPS-03 | 1 / P1 | Outbox/worker, idempotent consumers, retries/dead letter, OTel traces, incident diagnostics and immutable image promotion | Engineering | Planned |
| ESS-01 | 1 / P1 | Link user to worker; own profile/payslip, change requests and statuses; deny another employee/tenant | HR + engineering | Planned |
| WFM-01 | 1 / P1 | Leave types, balances, holiday dates, overlap checks and manager approval; approved absence to payroll projection | HR | Planned |
| WFM-02 | 1 / P1 | Raw time events, attendance import, corrections/approval, cutoff snapshot and payroll reconciliation | HR + payroll | Planned |
| SVC-01 | 1 / P1 | Service request categories, assignment, requester status/comments, SLA/escalation and attachment policy | HR | Planned |
| TAL-01 | 2 / P1 | Recruitment requisitions, candidates/retention, interviews, offer approval and identity-preserving conversion | Recruiting | Planned |
| ONB-01 | 2 / P1 | Employee/manager/IT checklists, policy acknowledgement, equipment and probation milestones | HR | Planned |
| EXP-01 | 2 / P1 | Receipt claims, policy limits, approval, reimbursement export and tax treatment review | Finance | Planned |
| PERF-01 | 2 / P1 | Goals/review cycles, self and manager feedback, approved outcome and retention | HR | Planned |
| INS-01 | 2 / P1 | Minimized tenant-safe read models, reporting permissions and audited exports; freshness visible | Analytics | Planned |
| CASE-01 | 2 / P1 | Disciplinary need-to-know grants, restricted evidence, decision review/employee communication and retention | HR + legal | Planned |
| EXIT-01 | 2 / P1 | Separation checklist, access/equipment clearance, approved final pay and retention | HR + payroll | Planned |
| TAL-02 | 3 / P2 | Learning, skills/evidence, development, calibration, succession and career mobility | Talent | Planned |
| REW-01 | 3 / P2 | Compensation review/budgets, benefit eligibility/enrollment and controlled provider files | Rewards | Planned |
| PLAN-01 | 4 / P2 | Headcount/cost scenarios, workforce actuals, contingent worker lifecycle, governed planning | Finance + workforce planning | Planned |
| INT-01 | 4 / P2 | Public API clients, scopes, quotas, webhook signatures/retries and integration credentials | Engineering | Planned |

Phase 0 can be reviewed with invented data. Phase 1 production payroll release is blocked until statutory/HR/finance approvals and production operational gates are independently evidenced. A feature’s presence in a reference form is not approval or evidence of implementation.


## Eight-area enrichment started · 10 November 2026

The original phase table above describes full workflow acceptance, not the smaller first increment. Each area now has a tracked initial implementation and explicit remaining work in [ENRICHMENT_IMPLEMENTATION.md](ENRICHMENT_IMPLEMENTATION.md). First increments do not close TAX-01/02/03, PAY-02/03, SEC-02 or OPS-02. Public Pages publication was completed after the original table was written; repository visibility was changed to public by the owner.

| Area | First increment | State |
|---|---|---|
| Payroll | Draft rule evidence, separate metadata review, run comparisons and simulation evidence packs | Implemented for staging; production statutory/bank gates outstanding |
| Employee records | Versioned effective-dated Core HR amendments, dated reads and history | Implemented; imported-source reconciliation outstanding |
| Daily experience | Linked-employee leave/time/service requests and HR/checker review | Initial workflow; advanced policies/manager scope outstanding |
| Lifecycle | Candidate stages, onboarding/exit tasks and restricted cases | Initial workflow; conversion/integrations outstanding |
| Talent | Goals, learning assignments and separate completion verification | Initial records; review cycles/LMS/succession outstanding |
| Finance | Claims, independent approval and benefit-request intent | Initial workflow; providers and reimbursements outstanding |
| Enterprise | Fourth service/RLS, encrypted payloads, category scopes and audit/policy views | Initial controls; SSO/MFA/delegated scopes/recovery outstanding |
| Insights | Role-filtered current counts and staffing cost scenarios | Initial projections; governed historical analytics outstanding |
