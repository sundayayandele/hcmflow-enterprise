# Validation record

Initial local unit coverage: Decimal rounding/reconciliation, earning/reimbursement/employer-cost behavior, negative net rejection, invalid calendar/currency inputs, XML entity rejection, supported parse formats and XLSX formula rejection.

End-to-end staging smoke script: authenticated tenant isolation across services, unlinked employee and role denial, source/duplicate protection, all four import formats, preview/commit replay, cross-tenant import denial, all-or-nothing errors, synthetic payroll totals, idempotency conflict, maker-checker separation including dual-role maker, export approval gate, GTBank/statutory/finalization blocks, balanced journal, audited exports, raw runtime SQL FORCE RLS, runtime audit write restrictions.

Browser suite: employee search, calendar/rule configuration, monthly preview, checker role switch/approval, release-gate visibility, mobile navigation and document overflow. Browser screenshots are retained as CI artifacts for 14 days. The Pages browser build has no backend calls in demo mode.

CI also validates Prometheus config and performs a disposable workforce restore with row-count verification. No production statutory engine, GTBank format, external bank acceptance, paid customer performance target, penetration test or full off-site encrypted disaster recovery is validated by these technical checks. Consult Actions for the final per-commit results.

## Local evidence · 2026-11-08

Eight unit tests pass, including rejection of ambiguous duplicate import fields. Desktop payroll approval and mobile navigation browser checks pass using system Chromium. All Compose smoke checks pass against PostgreSQL, including FORCE RLS and runtime audit permission denial. The disposable workforce restore matches the original employee row count. GitHub-hosted UI, Compose smoke, monitoring configuration and disposable restore validation passed on Ubuntu 24.04 in run 42522761803. Frontend npm audit reports zero known advisories after upgrading Vite to 7.3.7. Pages publication requires repository-owner enablement; the integration returns HTTP 403 for Pages administration.


## Enrichment first increment · 10 November 2026

Local checks: 16 Python tests and five browser tests pass. New transactional API tests cover workflow permissions/ownership, idempotency, balance/overlap and state rules, independent decisions, checklist closure, learning verification, restricted finance/cases, staffing arithmetic, dated employee history and evidence review that never enables production payroll. Browser journeys cover all eight areas, switching reviewers, page navigation persistence and narrow mobile layouts. Real PostgreSQL/Compose smoke and the four-database disposable restore drill run on GitHub Actions; inspect per-commit results. Provider acceptance, legal/statutory certification and full off-site disaster recovery remain outstanding.
