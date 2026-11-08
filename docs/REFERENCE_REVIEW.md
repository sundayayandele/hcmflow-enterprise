# Reference interpretation and outstanding decisions

Reviewed uploaded PRODUCT_REQUIREMENTS draft 0.2, INFRASTRUCTURE_REQUIREMENTS proposal 0.2, ARCHITECTURE proposal 0.2, extracted Nigeria Payroll MVP Review Form, and HCMFlow solutions-page PDF export. Original Markdown and text extractions are preserved under `docs/references`. The PDF explicitly lists employee self-service, payroll, recruitment, performance, time/leave, expenses, analytics, onboarding, exits, service requests and disciplinary management.

The DOCX contains blank reviewer names, unchecked approval boxes, blank rule tables and blank final signatures. **No completed sign-off is established.** Do not interpret “confirmed product decisions” headings or generic instructions as signed approval. No current rates, pension bases or GTBank format have been approved.

The user mentioned a “Nigeria payroll API review”; no separately named API-review file was included among the five uploaded files. The MVP form covers service boundaries, data intake and payroll requirements, but an additional API review remains unavailable. This implementation does not claim to have reviewed it.

Conflicts resolved:

- Older PRD sequences HR before payroll; current user explicitly says Nigerian payroll first. Phase 0 therefore prioritizes workforce intake and payroll controls, with broader suite workflows in later phases.
- Review form says all solution areas “included in MVP scope”, with acceptance criteria still blank. Current user says capability map + phased backlog and no attempt to deliver every enterprise feature in one release. Map all solutions and implement a narrow, honest first increment.
- Architecture proposal lists Next.js, Keycloak, RabbitMQ, Redis, OpenSearch and extensive telemetry. Current request calls for a practical VPS first deployment. Use React/Vite and three Python services now; record deferred production dependencies.
- Infrastructure proposal recommends a new isolated SSD Nodes VPS, Frankfurt provisional. No target host/access was confirmed. User subsequently deferred VPS and requested GitHub runners first, plus GitHub Pages demo. No VPS is accessed or deployed, no hosting purchased, and no marketing website is modified.

Release owners must still resolve employer/legal entity and tax authority assignments, population exemptions, current statutory bases and rates, parallel-run expected results, customer GL and payslip requirements, GTBank banking channel, source reconciliation, and service/recovery commitments. Current rule percentages are explicit synthetic inputs, not suggested Nigerian statutory defaults.
