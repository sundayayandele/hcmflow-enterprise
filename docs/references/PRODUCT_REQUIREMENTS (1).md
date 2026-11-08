# HCMFlow Enterprise Product Requirements

**Status:** Draft 0.2 · **Product:** HCMFlow Enterprise · **First payroll jurisdiction:** Nigeria · **Date:** 2026-11-08

## 1. Product vision

Build a secure, configurable HCM platform that helps employers manage the full worker lifecycle. The first payroll jurisdiction is Nigeria, and the initial design-partner profile is an organization with fewer than 200 employees. Begin with the HR workflows and payroll controls needed at this scale while designing tenant, organization and country boundaries for later enterprise and international growth. Keep country-specific rules in versioned country packs rather than hard-coding them into core services. The product name is **HCMFlow Enterprise**, extending the brand of the existing hcmflow.com website.

HCMFlow’s public material describes employee self-service, attendance/time management, shift management, leave, payroll, recruitment and performance. Sentrifugo’s historical feature set adds useful reference workflows for HR configuration, access roles, background checks, service requests, employee analytics, recruitment requisitions/interviews and feed-forward/manager evaluation. SAP SuccessFactors and Workday establish the longer-term breadth benchmark: core HR, payroll, recruiting, talent, learning, workforce management, analytics/planning, employee experience and contingent workforce management.

The goal is capability breadth over time, not a promise of feature-for-feature parity in the first release. HCMFlow Enterprise must not copy source code, proprietary wording, branding, designs, or non-public product material from reference products.

## 2. Product outcomes and measures

| Outcome | Initial measure |
|---|---|
| A customer can establish a trusted employee system of record | ≥98% of required employee records pass import validation before go-live |
| Routine requests move through auditable workflows | ≥90% of leave and profile-change requests have a recorded owner, state, decision and timestamp |
| Payroll preparation is explainable and reviewable | Every draft run has reconciled inputs, calculation breakdowns, exceptions and approval history |
| Employees can self-serve routine HR needs | Track self-service completion rate and HR helpdesk deflection by task |
| The platform protects tenant boundaries | No cross-tenant reads/writes in automated security checks; every request is tenant-scoped |
| Operators can detect and recover incidents | Alerts for service, queue, database and backup failures; documented restore objective met in rehearsal |

Thresholds are proposed and should be agreed with the first Nigerian design partner before production commitments.

## 3. Users and access roles

- **Employee / worker:** profile, documents, payslips, requests, time, leave, learning, goals, feedback and announcements.
- **Line manager:** team roster, approvals, scheduling, absence, performance conversations and team insights within delegated scope.
- **HR administrator / HR business partner:** people records, lifecycle events, organization structure, policies, cases, recruitment and reporting.
- **Recruiter / hiring manager / interviewer:** requisitions, applicants, interviews, feedback and offers, with candidate data access limited to hiring needs.
- **Payroll operator / approver:** pay inputs, payroll calculations, exceptions, approvals, payslips and exports; maker/checker separation for sensitive actions.
- **Learning / talent administrator:** catalog, learning assignments, skills, performance cycles and succession configuration.
- **Finance / auditor / executive:** scoped compensation costs, headcount, payroll reconciliation, workforce reports and audit evidence.
- **Customer tenant administrator:** company configuration, integrations and user/role administration, without access to other tenants.
- **HCMFlow Enterprise platform operator:** service operations and tenant lifecycle metadata; no default browsing access to customer HR data.

Role assignments must be composable and scoped by tenant, legal entity, country, site, organization, team, and record sensitivity. The design must support delegated authority, time-bounded access and break-glass access with reason capture and review.

## 4. Capability catalog

### 4.1 Foundation and Core HR

- Tenant, legal entity, country, site, currency, language, calendar, time zone and policy configuration.
- Person identity separate from employment relationship; support rehire and concurrent employments.
- Worker profile: contact details, emergency contacts, identifiers, employment terms, position, manager, cost center, location, documents and history.
- Effective-dated job, position, department, team, grade, location and reporting hierarchy.
- Lifecycle events: pre-hire, hire, transfer, promotion, salary/manager/location change, leave of absence, return, termination, rehire and contractor conversion.
- Configurable fields, forms, document templates, data validation and import/export with preview, error report and rollback plan.
- Employee directory, org chart, employee record timeline and searchable audit history.
- Contract and document repository with metadata, access control, versioning, expiry reminders and retention policy hooks.

### 4.2 Employee and manager experience

- Responsive role-based workspace, tasks, approvals, inbox, search and notifications.
- Employee self-service for personal data changes, address/bank details where enabled, leave, time, expenses, HR letters, payslips and policy access.
- Manager self-service for team data, approvals, job changes, transfers, goals, feedback, schedules and absence coverage.
- Announcements, birthdays/service milestones (configurable), employee directory and policy acknowledgements.
- Accessibility, keyboard navigation, clear status feedback and multilingual labels. Do not expose sensitive data in notification previews.

### 4.3 Time, attendance and workforce management

- Work schedules, shifts, calendars, rotating patterns, breaks, overtime rules, holiday calendars and location-based policies.
- Clock-in/out with source attribution (web/mobile/device/import); optional geofence and device integration, subject to customer policy and lawful basis.
- Timesheets, corrections, manager approval, absence calendar, leave balances/accruals, carryover and configurable entitlement rules.
- Coverage warnings, shift swap requests and workforce roster views.
- Store source events and derived calculations separately so corrections are explainable.

### 4.4 Payroll, compensation and benefits

- Payroll inputs, recurring and one-off earnings, deductions, benefits, loans/advances where configured, tax/statutory rules and pay groups.
- Payroll lifecycle: input cutoff, draft calculation, anomaly checks, reconciliation, approval, locked run, payslips, payment file and statutory output.
- Retroactive adjustments, off-cycle runs, reversals and corrections with explicit links to the original run.
- Per-line calculation explanation, rule/version and effective date for every amount.
- Compensation planning: salary review cycles, bands, budgets, proposals, approvals, equity views and letters.
- Benefits plans, enrollment windows, eligibility, dependent data, provider files and reconciliation.
- Country packs are versioned, tested and independently approved by payroll/legal subject-matter experts. Use external payroll partners where local complexity or payment execution makes in-house implementation unsuitable.

### 4.5 Recruiting and onboarding

- Requisition planning, headcount authorization, job templates and internal/external job postings.
- Candidate profile and consent/retention handling, source, application, screening stages, interview schedule, scorecards, feedback and decision trail.
- Offer approval, document generation, e-sign integration, background-check provider integration and candidate communications.
- Convert accepted candidate to pre-hire/worker without duplicating identity; onboarding tasks for employee, manager, HR, IT and facilities.
- Probation milestones, required training, equipment tracking and completion indicators.

### 4.6 Talent, performance, learning and skills

- Goals/OKRs, check-ins, continuous feedback, performance cycles, self-review, manager review, calibration and 360-degree feedback.
- Development plans, competencies, skills, qualifications and verified evidence/expiry.
- Learning catalog, assignments, registrations, attendance, completion, assessments and external LMS integration.
- Career interests, job/career paths, internal opportunities and succession plans with readiness and governance.
- Separate observed/inferred skills; explain recommendations and allow correction. Do not automate employment decisions without human review.

### 4.7 Employee service, expenses and lifecycle closure

- HR service catalog, case intake, categories, routing, SLA timers, assignment, escalation, attachments, knowledge articles and requester-visible status.
- Expenses and travel requests with policy limits, receipts, approvals, reimbursements and finance export.
- Separation checklist, access/equipment return, document handover, final pay inputs, exit interview and retention actions.
- Background checks and sensitive case data have stricter authorization, purpose limits and access logs.

### 4.8 Planning, analytics and extended workforce

- Standard operational reports: workforce roster, headcount, attrition, leave, time, hiring funnel, learning, performance completion and payroll reconciliation.
- Report builder with tenant-scoped fields, row-level permissions, scheduled delivery and exports.
- Workforce plan scenarios: headcount, skills, vacancies, labor cost, budget, organizational changes and actual-versus-plan.
- Contractor/contingent worker records, vendor, engagement, requisition, assignment, end date and conversion.
- Analytics uses governed, minimized data extracts/read models. Operational OLTP is not the analytics warehouse.

## 5. MVP boundary

### MVP 1 — Nigeria pilot-ready HR foundation (under 200 employees)

1. Tenant/legal entity setup, identity/SSO option, RBAC and audit events.
2. Employee records, org structure, lifecycle changes, document upload and import/export.
3. Employee/manager self-service, leave request/balance/approval, holiday calendar and notifications.
4. Basic attendance import/time entry and exception review; no advanced demand-forecast scheduling.
5. HR service requests and configurable approval workflows.
6. Basic dashboards and tenant-scoped CSV export.
7. Deployment automation, database backups, restore rehearsal, monitoring, logs and incident runbooks.

### MVP 1 explicitly excludes

- Multi-country payroll engine, statutory filing or payment execution.
- AI screening/ranking of candidates or automated employment recommendations.
- Full LMS authoring, advanced succession, compensation planning and workforce scenario modeling.
- High availability claims from a single VPS or unsupported RPO/RTO promises.

### MVP 2 — Nigeria payroll and hiring pilot

Recruiting workflow, onboarding, payroll for one validated jurisdiction or payroll-provider integration, payslips, expense workflows, advanced time/shift rules and local report packs.

### Later suite expansion

Performance/goal cycles, learning/skills, benefits, compensation planning, contingent workforce, skills-based internal mobility, workforce planning, expanded country packs and governed AI assistants.

## 6. Functional requirements

Requirement priority: **MUST** for pilot, **SHOULD** for early enterprise, **LATER** for suite expansion.

| ID | Priority | Requirement / acceptance condition |
|---|---|---|
| FR-001 | MUST | Every authenticated request resolves a tenant and authorized scope before accessing tenant data. Missing or ambiguous tenant context is denied. |
| FR-002 | MUST | Tenant admins can create legal entities, departments, sites, jobs, positions and manager relationships with effective dates. |
| FR-003 | MUST | HR can create, import, validate, correct and export employee records; import errors identify row, field and reason without partial silent writes. |
| FR-004 | MUST | Employee changes preserve prior values, actor, timestamp, reason and workflow reference. Sensitive-field access and export are audited. |
| FR-005 | MUST | Employee can submit a leave request and see balance, policy-relevant dates, approver, decision and history. Conflicting requests are detected. |
| FR-006 | MUST | Managers can approve, reject or request changes within configured authority; delegated and out-of-office approvals are auditable. |
| FR-007 | MUST | HR can configure leave types, holiday calendars, accrual/carryover policy and approval routes without code changes for ordinary policy variations. |
| FR-008 | MUST | Employee can submit an HR case, add permitted documents and see its current status; unrelated employees cannot discover the case. |
| FR-009 | MUST | Workflow definitions have versioning, effective dates, conditional routing, timeout/escalation, delegation and decision history. |
| FR-010 | MUST | Tenant administrator can provision users, assign roles/scopes, deactivate accounts and review access changes. |
| FR-011 | MUST | API, background worker and integration events carry trace ID, tenant ID and actor/service identity; sensitive payloads are not written to generic logs. |
| FR-012 | MUST | Platform emits metrics, traces and structured logs; alerting covers availability, latency, error rate, queue backlog, storage, DB capacity and backup age. |
| FR-013 | MUST | Backup jobs are encrypted, copied outside the primary provider account/failure domain and restore-tested at a defined cadence. |
| FR-014 | SHOULD | Recruiter can manage requisitions, candidates, interview feedback and offer approval with a data retention policy. |
| FR-015 | SHOULD | Payroll operator can produce a draft one-country run with input reconciliation, explainable line items, exception queue, maker/checker approvals and immutable run status. |
| FR-016 | SHOULD | Candidate-to-employee conversion preserves identity and links hiring events without copying unneeded candidate data. |
| FR-017 | SHOULD | Reports and exports obey the same tenant/scope rules as the underlying records; export is logged. |
| FR-018 | LATER | Learning, skills, succession, compensation planning, workforce scenarios and contingent workforce records are integrated with core worker/job identity. |
| FR-019 | LATER | AI suggestions cite approved tenant knowledge or source records, expose confidence/limitations, and require human confirmation for consequential changes. |

## 7. Non-functional requirements

- **Security:** OIDC/OAuth 2.1 compatible authentication; MFA for privileged access; strong password policy if local accounts are allowed; short-lived credentials; secrets manager; TLS; encryption at rest; secure SDLC; dependency and container scanning.
- **Tenant isolation:** application authorization plus database RLS where feasible; automated cross-tenant negative tests; tenant-aware caches, search indexes, queues, storage paths, reports and logs; never trust a client-supplied tenant ID without membership validation.
- **Availability:** pilot objective proposed at 99.5% monthly for externally visible core workflows, excluding planned maintenance; production target to be contractually agreed after HA deployment.
- **Recovery:** proposed pilot database RPO ≤ 15 minutes using WAL/PITR to independent storage and RTO ≤ 4 hours; validate these against available backup architecture and conduct restore drills. A single VPS remains a single-host failure risk.
- **Performance:** initial target p95 < 500 ms for common non-reporting API reads at agreed pilot load; async jobs for imports, reports, notifications and payroll calculations.
- **Scale:** horizontal scale for stateless APIs/workers; queue backpressure; connection pooling; load tests before customer scale claims.
- **Privacy:** data minimization, purpose limitation, configurable retention, access/export/deletion workflows, data residency choices and customer data processing terms.
- **Accessibility/localization:** keyboard-accessible flows, responsive layouts, local date/time/currency/number formats, locale-aware labels and right-to-left readiness.
- **Interoperability:** versioned REST APIs, webhooks, event contracts, idempotency, retry/dead-letter handling and import/export templates.
- **Operability:** deployment health checks, migrations with rollback strategy, runbooks, on-call alert routing, status communication and tenant-safe support diagnostics.

## 8. Data and workflow principles

- Person, worker/employment, candidate, user account and payroll identity are distinct entities linked by stable IDs.
- Effective-date every employment, organization and compensation change; retain transaction history.
- Store monetary values with currency and explicit precision; never use floating-point for money.
- Preserve source time events separately from approved/calculated time totals.
- Payroll runs are immutable after finalization; corrections are new linked runs or adjustments.
- Workflow decisions capture versioned policy, assigned authority, response and reason where required.
- Sensitive PII is encrypted and access-logged; search indexing is minimized and not treated as the system of record.

## 9. Integrations

Initial interfaces: OIDC SSO, CSV/XLSX import/export, email delivery, object storage, accounting/payroll exports, job board/career site, time-clock integration, bank/payment provider and external payroll provider. Each integration needs tenant-owned credentials, minimum scopes, rotation, delivery state, retries, idempotency and an audit trail.

## 10. Confirmed direction and remaining decisions

Confirmed: Nigeria first for payroll; initial customers under 200 employees; shared SaaS default with a dedicated-client deployment tier; new isolated SSD Nodes VPS; HCMFlow Enterprise name aligned with hcmflow.com.

Remaining decisions:

1. Which Nigerian payroll, tax, payment and statutory integrations are required for the first customer? Should the pilot calculate payroll or integrate with an existing payroll engine?
2. Which SSD Nodes location performs best from the actual Nigerian customer networks? Frankfurt is provisional based on published general Lagos-to-Europe measurements; test Frankfurt, Amsterdam, London and available US East locations.
3. What concurrency and document/attachment volumes should the first under-200-employee customer support?
4. What service hours, availability objective, data retention, RPO and RTO should the first paid tier commit to?
5. Is English the only launch language, or should Nigerian language support be included early?

## 11. Reference links and interpretation

- [HCMFlow solutions](https://hcmflow.com/solutions), [HCMFlow homepage](https://hcmflow.com/) and [HCMFlow about page](https://hcmflow.com/about). The exact solutions URL was not retrievable in this research session; accessible public HCMFlow pages surfaced time management/attendance, shifts, leave, payroll, recruitment, employee self-service and performance.
- [Sentrifugo GitHub organization](https://github.com/sentrifugo), [Sentrifugo repository](https://github.com/Sentrifugo/sentrifugo), [repository README](https://github.com/Sentrifugo/sentrifugo/blob/master/README.md), and [historical feature overview](https://sentrifugo.wordpress.com/feature/). The README identifies Sentrifugo 3.1.1 and a PHP/Apache/MySQL-era installation. Use this as a capability/workflow reference only; do not assume modern security, supportability or architecture.
- [SAP SuccessFactors HCM overview](https://www.sap.com/products/hcm/about-successfactors.html).
- [Workday HCM overview](https://www.workday.com/en-us/products/human-capital-management.html).
