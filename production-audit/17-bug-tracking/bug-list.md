# Defect List (running)  - commit 2a7cb43

| ID | Severity | Status | Description | Found in |
|---|---|---|---|---|
| BUG-01 | High (config) | Open | Default admin `admin@example.com`/`ChangeMe123!` seeded and still valid on live instance :8080 | Phase 1/earlier |
| BUG-02 | High (config) | Superseded by the verified entry below (fixed) | JWT secret falls back to public default if `APP_JWT_SECRET` unset (no startup refusal) | Phase 1 (code review, not yet exploited) |
| BUG-03 | Medium | **FIXED and re-tested** | Negative `hourlyRate` accepted | F11 |
| BUG-04 | Medium | **RESOLVED as documentation fix** (behaviour kept: latest commit deliberately made login ID-or-phone; README corrected) | Employee login ignores phone when ID is supplied; README said all three must match | F19 |
| BUG-05 | Low-Medium | **FIXED and re-tested** | Latitude/longitude not range-validated on locations | F42 |
| BUG-06 | Medium | **FIXED and re-tested** | Future-dated HR correction accepted | F46 |
| BUG-07 | Low | **PARTLY FIXED**: 405 and database-value errors now use the app error format; the Tomcat HTML 400 seen in F59 was caused by my test script sending an invalid URL, not an app fault. Spring default 403 body unchanged | Inconsistent error format (Tomcat HTML / Spring default JSON on type mismatch, 403) | F59 |
| BUG-08 | Low-Medium | Open | Hourly-rate employee on default MONTHLY mode pays 0 with no warning | Payroll run |

Statuses updated after Phase 11 (see fix-log-phase-11.md).

## Added in Phase 3 (UI/UX)
| ID | Severity | Status | Description |
|---|---|---|---|
| UX-01 | Medium | **FIXED and re-tested in the browser** | 14 inputs without a label (placeholder only) |
| UX-02 | Medium | **FIXED for all text that could be measured** (text over photo backgrounds not measurable) | Secondary-text contrast about 4.3:1 (< 4.5), badge 3.01, asterisk 2.75 |
| UX-03 | Low-Medium | **FIXED on phones/tablets** (desktop unchanged) | Many tap targets under 32 px on mobile |
| UX-04 | Low | **FIXED on HR pages and re-tested** | No `<h1>` on HR pages |
| UX-06 | Low | **FIXED indirectly** (backend now rejects invalid fences; no UI change) | UI shows invalid fence 999 (depends on BUG-05) |

## Updated / added in Phase 4 (API and security probing)
| ID | Severity | Status | Description |
|---|---|---|---|
| BUG-02 | **Critical (conditional)** | **FIXED and re-tested (see Phase 11)** | Admin token forged with the public default JWT secret was accepted on an instance without APP_JWT_SECRET (no login needed). Upgraded from High |
| BUG-09 | **High** | **FIXED and re-tested (see Phase 11)** | Parallel clock-in: 12 requests gave 7 open sessions for one employee and day, and 3 HTTP 500 (unique uq_att violation). No lock or unique rule on open sessions |
| BUG-10 | Medium-High | **FIXED and re-tested** | HR role can create ADMIN accounts and demote or deactivate other ADMINs |
| BUG-11 | Medium-Low | **FIXED and re-tested** | HTTP 500 on name over 120 chars and on payroll adjustment beyond DECIMAL(12,2); -99999999 adjustment accepted (no bounds) |
| BUG-12 | Low | **FIXED and re-tested** (API only; the separate static frontend host needs its own headers) | Missing HSTS, CSP, Referrer-Policy headers |
| BUG-13 | Low | Open (code review) | X-Forwarded-For first value trusted when trust-proxy is on |
| BUG-14 | Info | Open | No pagination on list endpoints (unbounded) |

## Round 4 (the "fix this also" list, MySQL, load, scans)
| ID | Severity | Status | Description |
|---|---|---|---|
| BUG-01 / SEC-02 | High | **FIXED in code, verified on a copy of the real database**; live instance changes when this version is deployed | Default admin password: accounts still on it must change it before anything else works |
| BUG-08 | Low-Medium | **FIXED and re-tested** | Payroll preview warns (and asks to confirm) when someone who worked would be paid 0 because the rate for the pay mode is missing |
| BUG-13 / SEC-08 | Low | **FIXED and re-tested** | X-Forwarded-For: client is the entry N places from the right (`APP_TRUSTED_PROXY_HOPS`), forged prefixes ignored |
| BUG-14 | Info | **FIXED for correctness** (round 5: the shared API helper fetches every page, so no screen shows only the first 1000 rows; large lists still load whole, no on-screen paging) | Lists capped at 1000 rows with `?limit=&offset=` and `X-Total-Count`; the response is bounded, the query cost is not; screens do not page yet |
| BUG-15 | High | **FIXED and re-tested on MySQL** | Migration V9 H2-only syntax; the app could not start on MySQL |
| BUG-16 | High | **FIXED and re-tested on MySQL** | 8 parallel payroll runs created 3 runs; unique index V16 |
| BUG-17 | Medium | **FIXED and re-tested on MySQL** | Deadlock between two employees punching together (HTTP 500) |
| BUG-18 | Medium | **FIXED**; 503 path not exercised | Connection pool exhaustion at 100 users (30 s hangs, 500s); pool 20, 5 s wait, 503 |
| BUG-19 | Low-Medium | **IMPROVED, still open** | Payroll preview issued 21,838 queries for 814 employees; request cache gives 10.9 s to 7.4 s with identical output; still about 9 ms per employee |
| SEC-12 | **High** | **FIXED and re-tested** | A demoted user kept the old role for up to 30 days (role came from the login token) |
| SEC-13 | Medium | **FIXED** (1 non-exploitable advisory left) | Vulnerable libraries: Spring Boot 3.5.16, Tomcat 10.1.61, Jackson 2.21.8, Log4j 2.26.1, react-router 7, vite 7; `npm audit` 0 |
| DB-FK | Low | Open | 12 `_id` columns lack foreign keys |
| SEC-05, SEC-07 | Medium / Low | Open | Token in local storage; in-memory lockout |
| SEC-11 | compliance | **PARTLY ADDRESSED (round 5)** | HR can now delete a person's face data (templates, request photos, punch photos) from the employee screen or API; a draft consent and retention policy is in docs/face-data-policy.md. Still needed: your decisions, legal review, a record of consent, deletion on leaving is manual |
| R14 | Medium | **PARTLY ADDRESSED (round 5)** | A CI workflow (.github/workflows/ci.yml) and 13 frontend tests were added; the workflow has not run on GitHub yet |
