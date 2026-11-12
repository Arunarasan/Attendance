# Production Audit - Arudra Attender (base commit 2a7cb43, all fixes uncommitted)

**Decision: NO-GO today, score 79/100** (not ready, remediation required). Start with the [overall report](01-executive-summary/overall-report.md) and the [final readiness report](18-final-approval/final-readiness-report.md).

| # | Report | Status |
|---|---|---|
| 01 | [Overall report](01-executive-summary/overall-report.md) | Final |
| 02 | [Architecture](02-architecture/architecture-report.md) | Phase 1, written before the fixes |
| 03 | [Functional testing](03-functional-testing/functional-test-report.md) | Done (API level) |
| 04 | [UI/UX](04-ui-ux/ui-ux-report.md) | Done; findings fixed |
| 05 | [API testing](05-api-testing/api-testing-report.md) | Done |
| 06 | [Database](06-database/database-audit.md) | Done on MySQL 8.4 |
| 07 | [Security](07-security/security-audit.md) | Done without independent scanners (earlier [preliminary list](07-security/preliminary-security-findings.md)) |
| 08-09 | [Performance, load, stress, soak](09-load-stress/load-stress-report.md) | Done on one machine |
| 10 | [Integration](10-integration/integration-report.md) | Not applicable (none exist) |
| 11-12 | [Compatibility and accessibility](11-compatibility/compatibility-and-accessibility-report.md) | Chromium only |
| 13 | [Code quality](13-code-quality/code-quality-report.md) | No static-analysis tool run |
| 14 | [Backup and recovery](14-backup-recovery/backup-recovery-report.md) | Verified on MySQL |
| 15 | [Deployment](15-deployment/deployment-readiness-report.md) | Partial: environment not audited |
| 16 | [Risk assessment](16-risk-assessment/risk-assessment.md) | Done |
| 17 | [Defects](17-bug-tracking/bug-list.md), [fix log](17-bug-tracking/fix-log-phase-11.md) | Final |
| 18 | [Final readiness report](18-final-approval/final-readiness-report.md) | Final |

Operations guide for whoever hosts the app: [docs/operations.md](../docs/operations.md). Draft face-data policy: [docs/face-data-policy.md](../docs/face-data-policy.md). CI workflow: [.github/workflows/ci.yml](../.github/workflows/ci.yml).
