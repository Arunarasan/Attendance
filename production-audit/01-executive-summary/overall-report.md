# Overall Audit Report: Arudra Attender

- **Date:** 2026-11-11. **Base commit:** `2a7cb43`; every fix is an uncommitted change in the working tree.
- **Decision: NO-GO for production today. Score 79 of 100 ("not ready, remediation required").** Details: [final readiness report](../18-final-approval/final-readiness-report.md).

## In one paragraph
The application is functionally sound and, after this audit, much safer: every critical and high finding is fixed and re-tested, it now runs on MySQL (it could not start there before), it holds up to 500 simultaneous users without errors and showed no memory growth in a 5-minute soak, and a database backup and restore was verified end to end. It is not approved for production because nobody has audited the hosting environment (HTTPS, monitoring, rollback, the Docker image), several areas rest on limited evidence (no independent scanners, Chromium only, no face/kiosk/Android testing), and a few policy decisions are open.

## What the audit found and fixed
| Area | Findings (all fixed and re-tested unless marked open) |
|---|---|
| Security | Forgeable admin token (public JWT secret); default admin password; demoted users keeping access for 30 days; HR able to create or take over admins; spoofable `X-Forwarded-For`; missing security headers; 15 vulnerable backend libraries and 4 frontend ones (1 non-exploitable Spring advisory remains) |
| Data integrity | Duplicate clock-in sessions; duplicate payroll runs on MySQL; MySQL deadlock between two employees punching together |
| MySQL | Migration V9 used H2-only syntax so the app could not start; fixed with per-database migration folders (checksum-safe for existing databases) |
| Validation | Negative pay, latitude 999, future-dated corrections, oversized input giving HTTP 500, unbounded lists |
| Load behaviour | Connection pool exhaustion turned into 30 s hangs and 500s; now a larger configurable pool and a clear 503 |
| Payroll | A zero-pay setup mistake was silent (now warned and confirmed); preview 32% faster with identical results |
| UI | Unlabelled fields, low contrast, small touch targets, missing page headings; new forced "set a new password" screen |
| Operations | Health endpoint, non-root Dockerfile (not built), backup and restore guide ([docs/operations.md](../../docs/operations.md)) |

## Evidence
141 backend tests pass (35 added; the original 106 unchanged; the new regression tests fail on the old code). The same 67-check functional and 67-check security scripts give identical results on H2 and on MySQL. Load, soak and race results are in [09-load-stress](../09-load-stress/load-stress-report.md); backup drill in [14-backup-recovery](../14-backup-recovery/backup-recovery-report.md).

## Still open
Deploy the new version and change the live admin password (R2); schedule and monitor backups; staging deployment with HTTPS and monitoring; CI; independent scanners (ZAP, Semgrep, axe, Lighthouse); Firefox, Safari, real phones, the Android app and face recognition in real light; token lifetime and face-data policy decisions; payroll scaling beyond a few thousand employees.

## Report index
[Architecture](../02-architecture/architecture-report.md) · [Functional](../03-functional-testing/functional-test-report.md) · [UI/UX](../04-ui-ux/ui-ux-report.md) · [API](../05-api-testing/api-testing-report.md) · [Database](../06-database/database-audit.md) · [Security](../07-security/security-audit.md) · [Performance/load](../09-load-stress/load-stress-report.md) · [Integration](../10-integration/integration-report.md) · [Compatibility and accessibility](../11-compatibility/compatibility-and-accessibility-report.md) · [Code quality](../13-code-quality/code-quality-report.md) · [Backup](../14-backup-recovery/backup-recovery-report.md) · [Deployment](../15-deployment/deployment-readiness-report.md) · [Risk assessment](../16-risk-assessment/risk-assessment.md) · [Defects](../17-bug-tracking/bug-list.md) · [Fix log](../17-bug-tracking/fix-log-phase-11.md) · [Final report](../18-final-approval/final-readiness-report.md)

## Limits of this audit
Findings are real and reproduced; areas not tested are not shown safe. Several of my own early test runs were wrong and were corrected and disclosed in the reports. An AI agent ran these tests: independent tools and human review should confirm the conclusions, and a person must approve any production deployment.
