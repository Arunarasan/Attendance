# API Testing Report (Phase 4)

- **Application:** Arudra Attender, commit `2a7cb43`; **Date:** 2026-11-11
- **Environment:** disposable backend on `localhost:8090` (fresh H2 DB, custom JWT secret) plus a second throwaway instance on :8091 for one default-config test. The live instance on :8080 was **not** attacked.
- **Tools:** curl, bash, Node `crypto` (token forging), openssl. **Not used:** Postman/Newman, OWASP ZAP, k6 (not installed; need approval).
- **Scripts and raw output:** [api-security-tests.sh](api-security-tests.sh), [api-run-raw.tsv](api-run-raw.tsv), [concurrency-and-latency.sh](concurrency-and-latency.sh), [concurrency-and-latency-output.txt](concurrency-and-latency-output.txt)
- **Coverage:** about 110 endpoints exist; this phase exercised about 45 of them with 67 scripted checks plus follow-up probes. Not every endpoint was tested; face/kiosk/app-pairing success paths need real devices.

## Results
| | Count |
|---|---|
| Scripted checks (final run, fresh DB) | 67 |
| Passed | 59 |
| Failed | 8 (see below: 4 real defects, 3 missing security headers, 1 explained) |
| Additional manual probes | 12 (race conditions, forged token, 500 reproductions, header banner) |

My first run was invalid: one test deactivated the primary admin and killed the token for the tests after it, and three tests were badly designed. I fixed the script, reset the database and re-ran; only the second run is counted. Defects found in the first run were re-confirmed in the second.

## Real defects
| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **A-RACE** | **High** | **Parallel clock-in creates duplicate sessions.** 12 simultaneous `POST /api/me/punch/in` for one employee returned 7x200, 2x409, **3x500**; HR's pending list then showed **7 open sessions for that employee on one day**. Cause: no lock or unique rule on open sessions; the day roll-up unique index (`uq_att`) then throws, giving 500. Double-taps, mobile retries or a flaky network can trigger it. All 7 are flagged for HR approval, which limits (not removes) the pay-inflation risk. | `concurrency-and-latency-output.txt`; backend log (3 unique-violation errors) |
| A14/A15 | Medium-High | **An HR (non-admin) user can create an ADMIN account and demote/deactivate another ADMIN.** HR and ADMIN are treated identically by the API (`hasAnyRole("HR","ADMIN")`); only a "last admin" guard exists. A rogue or compromised HR account can take over or lock out the owner. | A14, A15 in raw TSV |
| A41/A45 | Medium-Low | **HTTP 500 on oversized input**: a 5,000-character name (column is 120) and a payroll adjustment of `999999999999999` or `1e400` fail in the database and return 500. An adjustment of `-99999999` is accepted. No length or range validation. | A41; manual probes; DB log "Value too long" |
| A64-66 | Low | Missing response headers: `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`. (`X-Frame-Options`, `nosniff`, `no-store` are present.) | A64-66 |

Also seen and already logged: error bodies are not uniform (Tomcat HTML 400, Spring default JSON for 405/500).

## About the 8 failed checks
A14, A15, A41, A45(+manual probes), A64, A65, A66 are the defects above. A40 (3 MB body) is listed as failed by the script only because the server closed the connection before returning a status; it was refused, and a 1.5 MB body returned a clean 422, so it counts as handled.

## Verified working
- **Object-level access (IDOR), 10 checks:** employee B cannot cancel A's leave (404), see A's data, read or edit pay settings (403), read other balances (403) or approve leave (403). A foreign `employeeId` in the body of `/me/password` or in `/me/timesheet` is ignored; A's password was not changed by B.
- **Privilege checks:** an employee cannot create an ADMIN, promote self, or enrol a face for another user (403).
- **JWT:** `alg=none`, unsigned, bogus-signature, tampered-payload, empty-Bearer and Basic-auth tokens all give 401. A token forged with the public default secret is rejected by an instance that sets its own secret (the opposite case is SEC-01).
- **Injection:** SQL-injection strings in login email/password, employee code, date and month parameters gave 401/400 with no database errors in responses.
- **Malformed input:** invalid JSON 400, array body 400, wrong content type 415, no stack traces in bodies.
- **Exposure:** `/actuator`, `/h2-console`, path-traversal attempts: 401/404/400.
- **CORS:** a preflight from `https://evil.example` is refused (403); only the configured origin is allowed.
- **Throttling:** employee-ID login locks with 429 on the 6th failure and refuses even the correct password; `X-Forwarded-For` spoofing did not bypass it (trust-proxy off); email login also locks; unrecognised face punches reach 429 after 20 (as documented).
- **Duplicate submissions:** 8 parallel payroll runs for one month gave **1x200, 7x409, 1 run stored**. 8 parallel leave requests for the same day stored **1**. 8 parallel creations of one employee code stored **1**. These three are safe.

## Single-user baseline latency (sequential, local, H2, tiny dataset)
| Endpoint | p50 | p95 |
|---|---|---|
| `/api/me`, `/api/me/today`, `/api/hr/settings`, `/api/public/config`, `/api/hr/payroll/runs` | 3-9 ms | 15-30 ms |
| `/api/hr/employees` | 62 ms | 84 ms |
| `/api/hr/attendance/pending` | 80 ms | 112 ms |
| `/api/hr/attendance/register?date=` | 57 ms | 81 ms |
| `POST /api/auth/employee-login` (BCrypt, 5 calls) | 110 ms | 114 ms |

This is a baseline with one client on an almost empty database. It says nothing about behaviour under load or with realistic data (Phase 7, needs k6 or similar).

## Not covered
Pagination (the app has none: lists such as `/api/hr/employees` and `/pending` are unbounded, an Info-level scalability note), rate limits on authenticated endpoints (none found), idempotency keys (none), upload content-type validation beyond size, and success paths needing a registered phone, face or kiosk.

## Status
**API: FAIL for release as-is**, because of the clock-in race (data-integrity release gate) and the privilege model. Everything else is Low-Medium. No fixes applied.
