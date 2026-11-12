# Final Production Readiness Report

- **Application:** Arudra Attender (attendance and payroll)
- **Audit date:** 2026-11-11
- **Version:** base commit `2a7cb43` plus the audit's changes, which are **uncommitted** (47 changed files plus new files)
- **Environment:** disposable local instances: H2 and MySQL 8.4.7, JVM options as in the Dockerfile. The user's live instance was only read, never attacked. No production environment was available.
- **Tools used:** JUnit/Maven (141 tests), curl/bash scripts, a Node load generator, Node (token forging, dependency scan), `npm audit`, OSV database, `mysql`/`mysqldump`, the built-in Chromium browser, `jcmd`. **Not used:** OWASP ZAP, Semgrep, Trivy, k6, SonarQube, axe-core, Lighthouse, Playwright, Docker.
- **Tests executed:** backend 141 (all pass); functional script 67 (62 pass; the 5 others are test-design issues or by-design behaviour); API/security script 67 (66 pass; the other is a handled 3 MB refusal), repeated on H2 and on MySQL with identical results; load ramp 1 to 500 users; 5-minute soak (39,504 requests); race tests; backup and restore drill (29 tables compared); browser checks of 9 HR pages and the portal at 3 widths.
- **Skipped / blocked:** see "What was not covered".

## Decision
# NO-GO for production today (score 79 of 100: "not ready, remediation required")
The application is in good shape and every critical and high finding is fixed, but one release gate is not met (deployment configuration unverified) and several categories rest on limited evidence. A **conditional GO (80 to 89)** is realistic after the short list below.

## Weighted score
The scores are my judgement of the evidence, not tool output. Treat them as accurate to roughly plus or minus 5 points.

| Category | Weight | Score | Points | Why |
|---|---|---|---|---|
| Functional correctness | 15% | 88 | 13.2 | 141 tests; payroll matched hand calculation and a before/after comparison on 813 employees; UI workflows, face, kiosk, Android not clicked through |
| Security | 20% | 82 | 16.4 | All critical/high fixed and re-tested; independent scanners and a penetration test not run; token storage and biometric policy open |
| Performance | 15% | 80 | 12.0 | Ramp, stress and soak on MySQL at 814 employees; one machine; payroll linear; overload 503 path not proven |
| Database reliability | 10% | 88 | 8.8 | Runs on MySQL after 3 fixes; backup verified; 12 columns lack foreign keys |
| API reliability | 10% | 88 | 8.8 | 66/67 checks twice; about 45 of about 110 endpoints exercised |
| UI/UX and compatibility | 10% | 65 | 6.5 | Findings fixed; Chromium only; accessibility not certified; camera and Android untested |
| Code quality | 5% | 70 | 3.5 | Readable and well tested at the API; no CI, no frontend tests, no static analysis |
| Infrastructure and deployment | 10% | 55 | 5.5 | Application hardened; nothing at hosting level tested; no CI, monitoring or alerting; Docker image unbuilt |
| Backup and recovery | 5% | 85 | 4.25 | Dump and restore verified end to end; not scheduled or monitored |
| **Total** | **100%** | | **79.0** | |

## Release gates
| Gate | Status |
|---|---|
| Unresolved critical security vulnerability | **Clear** for everything tested (none known). Independent scanners not run |
| A critical business workflow is broken | **Clear** for punches, corrections, leave, holidays, payroll, payslips |
| Data integrity compromised | **Clear**: three races (clock-in, payroll run, day-row deadlock) fixed and verified on MySQL |
| Authentication or authorization bypassable | **Clear** after SEC-12 (role revocation); none found |
| Backup restoration not verified | **Clear**: verified on MySQL (see the backup report) |
| **Production deployment configuration unsafe or unverified** | **NOT MET**: no staging or production environment was audited (HTTPS, proxy, monitoring, rollback, image build) |

## Critical and high issues
- **Fixed and re-tested (uncommitted):** SEC-01 forgeable admin token, SEC-02 default admin password (takes effect on deploy), SEC-03 duplicate clock-ins, SEC-04 HR making admins, **SEC-12 demoted users keeping access**, BUG-15 app could not start on MySQL, BUG-16 duplicate payroll runs on MySQL, BUG-18 connection-pool exhaustion.
- **Outstanding high or critical: none known.**

## Outstanding defects (open)
| ID | Severity | Item |
|---|---|---|
| SEC-05 | Medium | 30-day login token in browser storage |
| SEC-07 / R17 | Low-Medium | Login lockout is per instance and in memory |
| SEC-11 / R12 | Compliance | Face-data consent and retention policy |
| BUG-19 / R10 | Low-Medium | Payroll preview is linear (about 9 ms per employee) |
| DB-FK | Low | 12 `_id` columns without foreign keys |
| BUG-14 | Low | **Resolved for correctness (update):** lists are capped at 1,000 per request but the app now loads every page; no on-screen paging controls |
| R11, R14, R15, R16, R18, R19 | various | No scheduled backup, no CI, browser/device/Android/face tests, hosting audit, Docker build, independent scans |

## What changed in this audit (all uncommitted)
Backend: JWT secret handling, per-employee row locks on all punch paths, atomic day-row upsert, payroll unique-run index (V16), forced password change (V15), role read from the database, HR/admin boundary, input validation, error format, security headers, `X-Forwarded-For` hops, list paging with `X-Total-Count`, health endpoint, payroll warning for zero pay, request cache for payroll, vendor-specific migration folders, connection pool settings, Spring Boot 3.5.16 with patched Tomcat, Jackson and Log4j, non-root Dockerfile. Frontend: accessibility fixes, "set a new password" screen, payroll warnings, `react-router-dom` 7 and `vite` 7. Docs: README, `docs/operations.md`, this folder. Tests: 35 new.

## What was not covered
Camera/face recognition quality, kiosk, Android app, Firefox/Safari/Edge, real phones, a real hosting environment (HTTPS, proxy, monitoring), Docker build, independent security scanners, WCAG 2.2 AA conformance, long soak (hours), production-sized data other than the generated dataset, and about half of the endpoints.

## Shortest path to a conditional GO
1. Commit and review the changes; deploy this version, then sign in as admin and set a real password (R2).
2. Build the Docker image; deploy to a **staging** host with MySQL, HTTPS and `APP_JWT_SECRET`; run the smoke tests in `docs/operations.md`.
3. Schedule and monitor database backups; add an uptime check and error alerts.
4. Add CI (backend tests, frontend build, `npm audit`).
5. Run one round of independent tools: OWASP ZAP and Semgrep, axe-core and Lighthouse.
6. Test the face punch, kiosk and Android app on real devices in real light, and in Firefox and Safari.
7. Decide the open policy questions (token lifetime, face-data consent and retention).

Done well, items 1 to 4 would clear the deployment gate and move the score to the low 80s; 5 to 7 would support a clean conditional GO.

## Update after the score (same day, round 5)
Added without re-scoring: a CI workflow (not yet run on GitHub), 13 frontend tests, all-pages loading of long lists, an HR action and API to delete a person's face data, and a draft face-data policy (docs/face-data-policy.md). Open items R12, R14 and SEC-11 are partly addressed, not closed. The score stays **79** until CI has run on GitHub, staging is audited and the policy is adopted; the decision stays **NO-GO**.

## Sign-off
No certificate is issued. Human approval is required for any production deployment; this report does not replace it.
