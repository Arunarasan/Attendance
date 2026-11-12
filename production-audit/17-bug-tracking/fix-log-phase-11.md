# Fix Log (Phase 11): blockers only

- **Base commit:** `2a7cb43`. Changes are **uncommitted** in the working tree for review.
- **Scope approved by the user:** "Fix blockers now". Fixed: BUG-02 (critical) and BUG-09 (high). **Not fixed:** every other item in the defect list.

## BUG-02 / SEC-01: admin token could be forged with the public default JWT secret
- **Change:** `application.yml` no longer has a default for `jwt-secret`. `JwtService.resolveSecret` now (a) generates a random 48-byte secret for the run if `APP_JWT_SECRET` is unset and logs a warning, (b) refuses to start if the value is shorter than 32 characters, and (c) refuses to start if it equals the old public default. README updated.
- **Files:** `config/JwtService.java`, `resources/application.yml`, `README.md`.
- **Side effect to know:** if `APP_JWT_SECRET` is unset, everyone is signed out on every restart and multiple instances cannot share sessions. Production must set it. A deployment that was (unknowingly) relying on the old default will sign everyone out once after upgrading, which is the intended outcome (existing tokens were forgeable).
- **Tests added:** `JwtSecretTest` (4 unit tests), `JwtForgeryTest` (integration: token signed with the old default is rejected). `JwtForgeryTest` **failed on the old code** (returned 200 with the employee list) and **passes now**.
- **Live re-test:** throwaway instance started with no secret: forged token now gets **401** (was 200); a normal login still works; the warning is logged.

## BUG-09 / SEC-03: parallel clock-in created duplicate sessions and HTTP 500
- **Change:** `TimeService.lockEmployee` (`SELECT ... FOR UPDATE` on the employee row) is called first inside the transaction of every path that reads then changes a person's sessions: `clockIn`, `clockOut`, `startBreak`, `endBreak`, kiosk/face `toggle`, and face-request `approve`. Simultaneous punches for one person now run one after the other, so the second sees the first and gets a normal 409.
- **Files:** `service/TimeService.java`, `service/KioskService.java`, `service/FaceRequestService.java`.
- **Tests added:** `ParallelPunchTest` (12 parallel clock-ins then 12 parallel clock-outs; expects exactly one 200, eleven 409, no 5xx, one stored session). **Failed on the old code** (`[500,500,409,500,500,200,...]`) and **passes now**.
- **Live re-test (H2):** original script: 12 parallel clock-ins gave **1x200, 11x409, 1 session stored** (before: 7x200, 2x409, 3x500, 7 sessions). Then 3 more rounds of 30 parallel clock-ins and 30 parallel clock-outs: each **1x200, 29x409**, 0 ERROR lines in the log. Payroll, leave and employee-create race checks still pass.

## Regression
- Full backend suite after the changes: **112 tests, 0 failures** (106 existing + 6 new). The 106 existing tests were not modified.
- Raw output: [../05-api-testing/concurrency-output-after-fix.txt](../05-api-testing/concurrency-output-after-fix.txt).

## Limits of this verification (be aware)
- The row lock is verified on **H2 only**. MySQL (InnoDB) supports `FOR UPDATE` in the same way and the code path is standard, but it has **not** been run on MySQL; do that before relying on it.
- The kiosk and face-request paths received the same lock but were **not** load-tested in parallel (they need a paired kiosk or face data).
- HR corrections (`CorrectionService`) can still touch the same day concurrently with a punch; not changed, not tested.
- A database-level guarantee (a unique rule on "one open session per employee") was not added because H2 and MySQL do not support partial unique indexes; the lock is the portable fix.

## Still open (not part of this fix)
SEC-02/BUG-01 default admin password is still seeded and still valid on the live instance (you must change it in the HR console); BUG-10 HR can create/demote ADMINs; BUG-11 oversized input gives 500; BUG-03/04/05/06/08; BUG-12 headers; UX-01..04. Release gate "unresolved critical security vulnerability" is now clear for the JWT item, but the default admin password remains a deployment-configuration risk.

---

# Fix Log, round 2 ("Fix more issues first")

Same base commit `2a7cb43`, still **uncommitted**. Scope: the remaining backend defects that need no product decision. Frontend/UX items and items needing a decision were left alone (listed at the end).

| Bug | What changed | Files |
|---|---|---|
| BUG-03, BUG-11 | Employee create/update: lengths match the columns (code 32, name 120, email 160, phone 32 digits); hourly rate and base salary must be 0 up to the column maximum. Payroll adjustment: limited to the column range and rounded to 2 decimals. New global handlers turn any other database "too long / out of range" error into HTTP 400 (and a duplicate-key race into 409) instead of 500 | `EmployeeService`, `PayrollService`, `ApiErrors` |
| BUG-05 | Locations: latitude -90..90, longitude -180..180, radius 10..100000, name at most 120 characters, on create and update | `HrController` |
| BUG-06 | HR corrections: a check-in or check-out later than now + 5 minutes is refused ("Times cannot be in the future") | `TimeService` |
| BUG-10 | Only an ADMIN can create an admin, promote someone to admin, edit/reset/deactivate an existing admin, or create a phone-pairing code for an admin. HR keeps all ordinary HR actions. (Found while fixing: the pairing code for an admin account would have let HR act as that admin, so it is blocked too.) | `HrController` |
| BUG-12 | Every API response now has `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and `Strict-Transport-Security` (1 year, sent on every response because the app normally sits behind a TLS proxy; browsers ignore it over plain HTTP). Existing nosniff / X-Frame-Options / no-store kept | `SecurityConfig` |
| BUG-07 (part) | Wrong HTTP method now returns `{"code":"METHOD_NOT_ALLOWED",...}` | `ApiErrors` |
| BUG-04 | README corrected to describe the real login (employee ID **or** phone, plus password). The code was not changed: the latest commit deliberately made it that way | `README.md` |

## Verification
- **New test class `InputRulesTest` (8 tests).** On the **original code it failed 7 of 8** (200 instead of 400, a 500 on the adjustment, HR getting 200 when creating an ADMIN, headers missing, no 405 JSON). On the fixed code **8 of 8 pass**.
- **Full suite: 120 tests, 0 failures** (112 after round 1 plus 8 new). No existing test was modified.
- **Real server, same scripts as before, unchanged:**
  - Phase 2 functional script: **59 -> 62 passed** (F11, F42, F46 fixed). The remaining 5 are known: F19 (by design, README fixed), F28/F29 (my test expectation; punch needs confirmation by design), F59/F60 (my script built an invalid URL).
  - Phase 4 API/security script: **59 -> 66 passed** (A14, A15, A41, A45, A64, A65, A66 fixed). Remaining: A40 (a 3 MB body is refused by the web server before the app sees it; counts as handled).
  - Concurrency checks unchanged and still correct (12 parallel clock-ins -> 1 session; payroll, leave and employee-create races -> 1 stored).
  - Latency unchanged within noise.
- Raw output: `../03-functional-testing/functional-run-after-fixes.tsv`, `../05-api-testing/api-run-after-fixes.tsv`, `../05-api-testing/concurrency-and-latency-after-fixes.txt`.

## Behaviour changes you should know about
- An HR user who previously edited or reset an ADMIN account now gets 403. If your HR staff are meant to manage admins, that is a product decision to reverse.
- Corrections more than 5 minutes in the future are refused.
- Very large or negative pay values are refused with a clear message.
- The HR console (frontend) shows server error text as is; the new messages are plain sentences, so it should display them. Not clicked through in the browser after this change.

## Still open after round 2
BUG-01 default admin password (you must change it on the live instance; the seed behaviour was not changed), BUG-08 hourly employee on monthly mode pays 0 with no warning (needs a product decision on how to warn), BUG-13 X-Forwarded-For first value (conditional), BUG-14 no pagination, and all UI/UX findings UX-01 to UX-04 (labels, contrast, tap targets, headings). The separate static frontend host still needs its own security headers. MySQL remains untested for the row lock and migrations. Phases 5-10 and 12-13 are not done, so no GO decision.

---

# Fix Log, round 3 (UI issues)
See the "Round 2: fixes and re-test" section of [../04-ui-ux/ui-ux-report.md](../04-ui-ux/ui-ux-report.md) for details. Summary: UX-01 labels, UX-02 contrast, UX-03 touch targets, UX-04 headings fixed in `frontend/src`; TypeScript check and production build pass; browser re-test shows 0 unlabelled controls, 0 measurable contrast failures, 0 small touch targets on phone (one inline link exempt), `<h1>` on every HR page. All uncommitted. No backend change in this round, so the 120 backend tests were not re-run.

---

# Fix Log, round 4 (the remaining list, MySQL, load, scans)
Scope: default admin password, zero-pay warning, `X-Forwarded-For`, pagination, MySQL, and the unexecuted audit phases. All uncommitted, base commit `2a7cb43`. Full findings are in the [final readiness report](../18-final-approval/final-readiness-report.md) and the individual reports; summary of code changes:

| Change | Files |
|---|---|
| Forced password change: migration V15, flag set at startup for admin/HR on the default, enforced in the request filter, new "set a new password" screen; the default cannot be chosen as the new password | `V15__must_change_password.sql`, `Jobs`, `SecurityConfig`, `EmployeeService`, `M`, `AppProps`, `ChangePasswordRequired.tsx`, `App.tsx` |
| Role read from the database each request | `SecurityConfig` |
| `X-Forwarded-For` trusted-proxy hops | `ClientIp`, `application.yml` |
| Paging helper and `X-Total-Count` on 6 list endpoints; pending count as a `COUNT` | `Paging`, `HrController`, `HrPayLeaveController`, `TimeService` |
| Payroll warning (and confirm in the UI); request cache; check for an existing run before the long preview; unique run per month (V16) | `PayrollService`, `RequestCache`, `PolicyService`, `CalendarService`, `OffDayService`, `V16__payroll_one_run_per_month.sql`, `PayAdmin.tsx` |
| MySQL: vendor migration folders (`db/vendor/{h2,mysql}`), atomic day-row upsert, 503 for lock/pool errors, pool 20 / 5 s | `application.yml`, `TimeService`, `ApiErrors` |
| Health endpoint; non-root Dockerfile with a version-independent jar path | `HealthController`, `Dockerfile` |
| Dependencies: Spring Boot 3.5.16 plus Tomcat, Jackson, Log4j overrides; `react-router-dom` 7, `vite` 7 | `pom.xml`, `package.json`, `package-lock.json` |
| Docs | `README.md`, `docs/operations.md` |

Tests added this round: `PasswordChangeRequiredTest` (4), `ClientIpTest` (4), `PayWarningTest` (5), `PagingTest` (5), `HealthTest` (1), `ParallelPayrollTest` (1), `RoleRevocationTest` (1): suite is **141 tests, 0 failures**. `RoleRevocationTest` failed on the old code. `ParallelPayrollTest` passes on H2 either way (H2 hides the race); its real proof is the MySQL run (8 parallel runs: 3 created before, 1 after).

Known limits of the verification: the Docker image was not built; the 503 overload path was not triggered; `ClientIpTest`, `PagingTest` and `PayWarningTest` test new code and could not run against the old code.

---

# Fix Log, round 5 (CI, frontend tests, paging, face-data deletion)
Still uncommitted, base commit `2a7cb43`.

| Change | Files | Verification |
|---|---|---|
| **All list screens now load every page**: the shared `api()` helper follows `X-Total-Count` with `limit`/`offset` until the list is complete (not for POST, or when the caller already passed `limit`/`offset`) | `frontend/src/lib/api.ts` | 8 unit tests; with the paging branch disabled one test fails (checked), restored |
| **Frontend tests added** (Vitest 5 + Testing Library): paging helper, forced "set a new password" screen (mismatch, success request, server error, sign out) | `vitest.config.ts`, `package.json` (`npm test`), `src/lib/api.test.ts`, `src/pages/ChangePasswordRequired.test.tsx` | **13 tests pass**; `npm audit`: 0 vulnerabilities |
| **CI workflow**: backend tests (Java 17), a real start on MySQL 8.4 with a health check (catches MySQL-only failures), frontend `npm audit` + tests + build | `.github/workflows/ci.yml` | **Not run** (needs GitHub); locally verified `npm ci --dry-run`, the audit gate and the jar path |
| **Delete a person's face data**: `DELETE /api/hr/employees/{id}/face` and a "Remove face data" button with confirmation; removes templates, face-request photos and punch photos; hours and pay stay; admin accounts only by admins | `FaceService`, `KioskService`, `HrController`, `EmployeeDrawer.tsx` | 2 new backend tests; **checked in the browser** (confirmation, server state, toast, button disappears) |
| **Draft face-data consent and retention policy** written from what the app does, including its gaps | `docs/face-data-policy.md` | Draft for legal review, not legal advice |

Totals now: **143 backend tests, 13 frontend tests, all passing**; frontend build passes.

Not done in this round: committing (not requested), running CI on GitHub, on-screen paging controls, the other open items in the final report.
