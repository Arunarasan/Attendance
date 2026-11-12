# Application Architecture Report (Phase 1 - Discovery)

- **Application:** Arudra Attender (attendance and payroll)
- **Audit date:** 2026-11-11
- **Git commit:** 2a7cb43 (branch `main`, clean working tree at audit start)
- **Environment:** Windows 11 dev machine, JDK 17, Maven 3.9.11, Node (Vite 5.4.21); H2 file database
- **Method:** read-only source inspection plus the checks already run in the earlier QA session. Nothing in the application was modified.
- **Status of this report:** Phase 1 only. Phases 2-13 have **not** been executed; no GO/NO-GO is issued here.

## 1. Components
| Layer | Technology | Size |
|---|---|---|
| Backend | Spring Boot 3.3.5, Java 17, JDBC (`JdbcClient`, no ORM), Flyway, Spring Security, jjwt, BCrypt | about 30 Java files |
| Frontend | React 18 + TypeScript + Vite, react-router, `@vladmandic/face-api` | 75 modules |
| Mobile | `android-app/`: Kotlin WebView shell with hardware-Keystore signing bridge (31 tracked files) | not inspected in this phase |
| Database | H2 file (dev/default, `MODE=MySQL`), MySQL via profile `mysql` | 14 Flyway migrations (V1-V14), 28 `CREATE TABLE`, 7 indexes, 11 foreign-key references |
| Deploy | Dockerfile (multi-stage Maven build, `eclipse-temurin:17-jre`, `-Xmx350m`, `$PORT` aware, Render-style) | single container |

Total source about 11.4k lines. Largest files: `Portal.tsx` (719), `PayAdmin.tsx` (583), `TimeService.java` (355), `PayrollService.java` (265).

## 2. Entry points and roles
- **Roles:** `EMPLOYEE`, `HR`, `ADMIN` (plus kiosk employees `OFFICE_DEVICE`).
- **Public:** `/api/auth/login`, `/api/auth/employee-login`, `/api/public/**` (face punch, face request, kiosk, app pairing).
- **HR/Admin:** `/api/hr/**` is gated by URL rule `hasAnyRole(HR, ADMIN)`.
- **Everything else** only requires authentication; per-record ownership is enforced in controller/service code (to be verified in Phase 6, IDOR).
- **Auth:** stateless JWT (HS256, 720 hours) via `Authorization: Bearer`, or `X-Device-Token` for the paired phone app. The token filter re-checks `employees.active` on every request.
- **~110 endpoints** (about 55 GET, 40 POST, 15 PUT, 5 DELETE) across `MeController`, `HrController`, `HrPayLeaveController`, `OffDayController`, `PayPolicyController`, `PublicController`.

## 3. Business modules
Time (sessions to day totals), Verification (geo-fence, office network IP/BSSID, phone key, face), Face enrol/punch/learning, Face photo requests, Kiosk, App pairing, Corrections, Weekly off (per employee, HR approval), Leave and holidays, Pay policy, deductions, loss of pay, honour score, Payroll runs and payslips, general settings.
Scheduled jobs: missed check-out flagging (hourly), long-open session alerts (30 min, log only), photo purge (daily 03:00).

## 4. Existing test coverage
- **Backend:** 14 test classes, 106 tests at audit start (17 classes, 112 after the Phase 11 fixes), all passing (in-memory H2, end-to-end HTTP flows). Strong around payroll maths, punches, face, leave, weekly off, login.
- **Frontend:** no unit tests, no Playwright/E2E, no accessibility or Lighthouse runs.
- **CI/CD:** none found (no `.github/`). No load, security-scan, or backup/restore tests.

## 5. Observations from discovery (to be confirmed in later phases, not yet tested)
Severity is provisional.

| # | Observation | Provisional severity | Phase to verify |
|---|---|---|---|
| D1 | Default admin `admin@example.com` / `ChangeMe123!` seeded when the employees table is empty, and **confirmed still valid on the instance running at localhost:8080** | High | 6 |
| D2 | `app.jwt-secret` falls back to a public, source-visible default (`dev-only-secret-...`) if `APP_JWT_SECRET` is unset; nothing refuses to start in that state. Anyone could forge an ADMIN token on such a deployment. | High (config) | 6, 10 |
| D3 | JWT lifetime is 30 days, stored in `localStorage`, no revocation list or refresh (only the `active` check). XSS would expose it. | Medium | 6 |
| D4 | CSRF disabled (acceptable for bearer-token API); CORS is an allow-list from `APP_CORS`, default localhost. Must be set correctly in production. | Info | 6, 10 |
| D5 | Login throttle and face-punch throttle are in-memory per instance, keyed by ID+IP; lost on restart; not shared across instances | Medium | 4, 6 |
| D6 | H2 file DB is the default datasource with an empty `sa` password; MySQL path "has only been run on H2" (README). Production DB engine is unverified. | High (until verified) | 5, 10 |
| D7 | No backup, restore or retention procedure in the repo | High (release gate) | 14 |
| D8 | No `/health` or actuator endpoint, no structured logging or error monitoring; notifications are log-only | Medium | 10 |
| D9 | Dockerfile hardcodes `attendance-0.1.0.jar` (breaks on version bump); runs as root; no HEALTHCHECK | Low-Medium | 10 |
| D10 | Dynamic SQL is built by concatenating constant column lists only (`SESSION_COLS`, `SLIP_COLS`, `COLS`); all user values are bound parameters. No injection found by inspection, still to be scanned. | Info | 6 |
| D11 | Only 7 explicit indexes for 28 tables; likely fine at small scale, unverified for register/timesheet queries | Low | 5, 8 |
| D12 | Face data (templates, photos up to 300 KB) is personal biometric data; retention is 30 days for photos, templates kept until HR re-enrols. Needs a privacy/consent review. | Medium (compliance) | 6 |
| D13 | `face-api` bundle 1.3 MB; large pages (`Portal.tsx`, `PayAdmin.tsx`) are monolithic | Low | 13 |
| D14 | 0 `TODO/FIXME`, 0 `dangerouslySetInnerHTML` (XSS surface is small by inspection) | Positive | 6 |
| D15 | `@Transactional` appears 46 times; multi-step payroll and approval flows appear covered, concurrency not yet tested | Info | 5 |

## 6. Limitations
- Android app, MySQL, kiosk hardware, camera, and real WiFi/GPS were not inspected.
- The running instance at :8080 is the user's own and may hold real data, so only read-only calls were made against it.
- No tools such as Playwright, ZAP, Semgrep, k6, Trivy or Lighthouse were run yet (none are installed or configured in the repo).

## 7. Proposed next steps
Phase 2+ needs a **disposable test instance** (new H2 DB, separate port, with a known test admin), so destructive and load tests never touch the live database. Approval is requested before installing external tools and before any fixes (Phase 11).
