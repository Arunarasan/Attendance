# Functional Test Report (Phase 2, API-level)

- **Application:** Arudra Attender, commit `2a7cb43`
- **Date:** 2026-11-11
- **Environment:** disposable instance, `localhost:8090`, fresh empty H2 file DB, test admin and test JWT secret. The user's live instance on :8080 was **not** touched.
- **Tools:** curl + bash script ([functional-tests.sh](functional-tests.sh)); raw results [functional-run-raw.tsv](functional-run-raw.tsv). The backend's own 106 JUnit tests (as of audit start) (all passing) were run in an earlier session and are separate.
- **Method:** black-box HTTP calls with valid and invalid input, per module.

## Scope and honest limits
This phase covers **API-level** functional behaviour only. **Not done yet:** UI click-through of every screen (Phase 3), camera/face punch, kiosk, Android app, and email/SMS (none exist). Test IDs below are the script's run order (F01-F67), not a formal test-case catalog with preconditions; the script itself lists steps and expected codes.

## Result summary
| | Count |
|---|---|
| Executed in the scripted run | 67 |
| Passed | 59 |
| Failed (as scripted) | 8 |
| Of the 8: real application defects | 4 (F11, F19, F42, F46) |
| Of the 8: wrong expectation in my test, behaviour is by design | 2 (F28, F29) |
| Of the 8: bug in my script (bad ID extracted), re-tested manually and passed | 2 (F59, F60) |
| Blocked / skipped | 0 |

The first run of the script was invalid (the app requires an email on every employee, which my script omitted, so everything downstream cascaded). I fixed the script, reset the database to empty and re-ran; only the second run is counted above.

## Real defects found
| ID | Test | Expected | Actual | Severity |
|---|---|---|---|---|
| F11 | Create employee with `hourlyRate: -50` | 400 | **200, saved** | Medium (can produce negative pay) |
| F19 | Employee login with correct ID + correct password + **wrong phone** | 401 | **200, token issued** | Medium (spec/doc mismatch; see below) |
| F42 | Create location with `latitude: 999` | 400 | **200, saved** | Low-Medium (invalid fence silently never matches) |
| F46 | HR correction dated 2030-01-01 (future) | 400 | **200, session created** | Medium (future hours could reach payroll) |

**F19 detail:** `MeController.employeeLogin` uses the phone only when the employee ID is blank (code comment: "ID or phone number (either one)"). The README says "all three must match". The README claim is false for the current code. This weakens the intended login, but it is a design/documentation conflict, not an injection or bypass of the password.

## Other observations (not scored)
- `GET /api/hr/payroll/runs/<non-numeric>/payslips` returns a raw Tomcat HTML 400 page instead of the app's JSON error format; several Spring-default 400/403 bodies also differ from `{code,message}`. Low.
- Employees created as hourly (rate 100, base 0) with the default pay mode `MONTHLY` get **gross 0.00** in payroll with no warning. Pay mode is a separate per-employee setting. Usability risk for HR. Low-Medium.
- Email is mandatory for every employee even though employees sign in with ID/phone. Usability. Info.
- Login lockout works (HTTP 429 after repeated failures).

## Verified working (evidence in raw TSV)
- **Auth:** admin login; wrong password 401; no token 401; forged token 401; employee login with ID/phone formats (`+91 98765 43210` accepted); wrong password 401; empty body 401; password change rules (wrong current 400, <8 chars 400, success 200); old password rejected after change; deactivated employee's token rejected 401.
- **Authorization:** employee gets 403 on `/api/hr/**` (employee list, payroll generate, leave balances).
- **Employees:** duplicate code, duplicate phone (same last 10 digits), missing name, invalid role, weak password all rejected; update and not-found update behave.
- **Punch:** clock-out with no session 409; first clock-in without a face/office network returns 422 `NEEDS_CONFIRMATION` (soft verification by design); with `confirm` it needs a reason (400 "Add a short reason for HR"), then records a flagged PENDING session; second clock-in 409; unknown action 400.
- **Holidays:** create, duplicate date 409, missing date 400, delete.
- **Settings/networks:** zero standard hours 400, invalid weekday 400, valid save 200, invalid CIDR 400.
- **Leave:** types seeded; overlap rejected; end-before-start rejected; employee request and cancel.
- **Corrections:** end-before-start rejected; HR-recorded days saved.
- **Payroll:** malformed period 400; generate 200; **duplicate run 409**; adjust payslip works; employee sees own payslips.
- **Payroll arithmetic spot-check (independent hand calculation):** 30,000 monthly, Oct 2026 (31 days, 4 Sundays off = 27 scheduled days), 8h standard, 10h worked on one day, overtime x1.5: expected `30000/(8x27) = 138.889/h`; `8h x 138.889 + 2h x 138.889 x 1.5 = 1,527.78`. App preview returned **1527.78**. Matches.

## Not covered (needs later phases)
Sorting/pagination (no paginated endpoints found), file upload (photos are base64 in JSON), UI forms and empty/loading/error states, rate limiting beyond login, concurrency.

## Status
**Functional (API) status: PASS WITH DEFECTS.** 4 real defects, none a payroll-math error. No fixes applied yet (Phase 11 requires a decision first).
