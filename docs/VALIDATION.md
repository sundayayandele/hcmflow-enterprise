# Validation record

Initial local unit coverage: Decimal rounding/reconciliation, earning/reimbursement/employer-cost behavior, negative net rejection, invalid calendar/currency inputs, XML entity rejection, supported parse formats and XLSX formula rejection.

End-to-end staging smoke script: authenticated tenant isolation across services, unlinked employee and role denial, source/duplicate protection, all four import formats, preview/commit replay, cross-tenant import denial, all-or-nothing errors, synthetic payroll totals, idempotency conflict, maker-checker separation including dual-role maker, export approval gate, GTBank/statutory/finalization blocks, balanced journal, audited exports, raw runtime SQL FORCE RLS, runtime audit write restrictions.

Browser suite: employee search, calendar/rule configuration, monthly preview, checker role switch/approval, release-gate visibility, mobile navigation and document overflow. Browser screenshots are retained as CI artifacts for 14 days. The Pages browser build has no backend calls in demo mode.

CI also validates Prometheus config and performs a disposable workforce restore with row-count verification. No production statutory engine, GTBank format, external bank acceptance, paid customer performance target, penetration test or full off-site encrypted disaster recovery is validated by these technical checks. Consult Actions for the final per-commit results.
