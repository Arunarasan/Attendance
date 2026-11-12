# Risk Assessment Report (Phase 12 item 16)

Likelihood and impact are my judgement from what was tested; they are not measured probabilities. Status is as of the end of this audit; all code fixes are **uncommitted**.

| # | Risk | Likelihood | Impact | Status | Mitigation |
|---|---|---|---|---|---|
| R1 | Deployed without `APP_JWT_SECRET`: anyone could once forge an admin | Was high | Critical | **Mitigated** (no public default; random per start) | Set a strong secret anyway (sessions survive restarts) |
| R2 | Default admin password left in place | Was high | High | **Mitigated in code**; the live instance stays exposed **until the new version is deployed** and the admin sets a password | Deploy, restart, sign in, change it; or set `APP_ADMIN_PASSWORD` first |
| R3 | Duplicate clock-ins inflate pay | Was medium | High | **Mitigated** (row lock, verified on H2 and MySQL) | Keep HR approval of flagged punches |
| R4 | Duplicate payroll runs for a month | Was medium (MySQL) | High | **Mitigated** (unique index) | If V16 fails on an old database, remove the duplicate run first |
| R5 | Demoted or removed HR staff keep access | Was medium | High | **Mitigated** (role read from the database each request) | Deactivate accounts promptly; consider shorter tokens |
| R6 | A rogue HR user makes or takes over admin accounts | Low | High | **Mitigated** (admin-only) | Review who has HR |
| R7 | Stolen device or script injection exposes a 30-day token in local storage | Low | Medium-High | **Open** | Shorter token lifetime, refresh tokens, or httpOnly cookies |
| R8 | MySQL-only failures at go-live | Was high | High | **Mitigated** (3 fixed; suite run on MySQL) | Re-run the scripts on the real MySQL version and settings |
| R9 | Overload: pool exhaustion then slow or failed requests | Medium (big offices at shift start) | Medium | **Mitigated** (pool 20, graceful degradation measured to 500 users) | Tune `DB_POOL_SIZE`; load-test on production hardware; the 503 path itself was not proven |
| R10 | Payroll takes minutes for thousands of employees and the proxy times out | Low now, medium if the company grows | Medium | **Open** (about 9 ms per employee) | Longer timeout or a background payroll job |
| R11 | Data loss: no scheduled backup | Medium | Critical | **Open**: verified procedure, nothing schedules or monitors it | Schedule, encrypt, copy off-site, test restores quarterly |
| R12 | Biometric (face) data without consent and retention policy | Medium | High (legal) | **Partly addressed**: HR can delete a person's face data; draft policy in docs/face-data-policy.md. Open: your decisions, legal review, consent records | Adopt the policy; add deletion to the leaving checklist |
| R13 | Vulnerable libraries | Was high | Medium-High | **Mitigated** (1 non-exploitable Spring advisory left) | Plan Spring Boot 4; run a dependency scan in CI |
| R14 | Regressions go unnoticed: no CI, no frontend tests | High over time | Medium | **Partly addressed**: CI workflow and 13 frontend tests added; the workflow has not run on GitHub yet | Push, watch the first run, fix anything it finds |
| R15 | Works in Chromium only: other browsers, phones, the Android app, face recognition in real light unverified | Medium | Medium-High | **Open** | Device and browser test round |
| R16 | Hosting-level failures: TLS, proxy settings, restarts, no monitoring or alerts | Medium | High | **Open** (not audited) | Staging deployment, uptime and error monitoring |
| R17 | Single instance and in-memory login lockout reset on restart | Low | Low | **Open** | Fine for one instance; shared store before scaling out |
| R18 | Docker image never built | Medium | Low-Medium | **Open** | Build and run once |
| R19 | An independent scanner finds something manual testing missed | Medium | Unknown | **Open** | Run ZAP and Semgrep; consider a short penetration test |

## Top five to close before go-live
R2 (deploy and change the password), R11 (schedule backups), R16 (staging, HTTPS, monitoring), R15 (browser and device round, especially face punch), R14 (CI).
