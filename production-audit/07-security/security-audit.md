# Security Audit Report (Phase 6, final for this audit)

- **Application:** Arudra Attender, base commit `2a7cb43` plus uncommitted fixes. **Date:** 2026-11-11.
- **Environment:** disposable instances (H2 and MySQL 8.4.7); the user's live instance was never attacked. A copy of the real H2 database was used once, only to test the upgrade.
- **Method:** manual probing with scripts (66 API/security checks, 3 token-forging variants, injection strings, privilege and IDOR checks, parallel-request races), source review, dependency scan against the public OSV database, `npm audit`, secrets scan of the full git history, Android manifest review.
- **Not run (not installed; would need your approval to download):** OWASP ZAP, Semgrep, Trivy, SonarQube, a penetration test by a person. The conclusions below are therefore **not** a substitute for an independent scan.
- No real secret appears in this report; the default values mentioned are the app's own public defaults.

## Findings and status
| ID | Severity | Finding | Status |
|---|---|---|---|
| SEC-01 | Critical (conditional) | Admin token could be forged with the public default JWT secret when `APP_JWT_SECRET` was unset | **Fixed, verified**: no default; random secret per start; short or old-default secrets refuse to start; forged token now 401 |
| SEC-02 | High | Default admin `ChangeMe123!` seeded and valid on the live instance | **Fixed in code, verified on a copy of your real database**: any admin/HR account still on the default must change it before anything else works (API returns 403 `PASSWORD_CHANGE_REQUIRED`; the web app shows a "Set a new password" screen). **Takes effect when you deploy this version and restart; until then the live instance is unchanged.** Setting `APP_ADMIN_PASSWORD` before first start avoids the default entirely |
| SEC-03 | High | Parallel punches created duplicate sessions and 500 errors | **Fixed, verified** on H2 and MySQL |
| SEC-04 | Medium-High | HR could create admins, demote or reset admins, pair a phone to an admin | **Fixed, verified** |
| **SEC-12** | **High (new)** | **The access role came from the login token, so a demoted HR user (or an HR user demoted to employee) kept HR access for up to 30 days.** Found while writing this report | **Fixed, verified**: the role is read from the database on every request; the regression test failed on the old code |
| SEC-06 | Medium | Missing input validation caused 500s; negative rate, future corrections, latitude 999 accepted | **Fixed, verified** |
| SEC-08 | Low | First `X-Forwarded-For` value trusted behind a proxy (forgeable) | **Fixed, verified**: the client is the entry `APP_TRUSTED_PROXY_HOPS` places from the right; header ignored unless `APP_TRUST_PROXY=true` |
| SEC-09 | Low | Missing HSTS, CSP, Referrer-Policy | **Fixed, verified** (API only; the static frontend host needs its own headers) |
| SEC-13 | Medium | **Vulnerable libraries**: 15 backend libraries had known advisories (Spring Boot 3.3.5 is out of support); frontend had 4 (`vite`, `esbuild`, `react-router`) | **Fixed**: Spring Boot 3.5.16 plus patched Tomcat 10.1.61, Jackson 2.21.8, Log4j 2.26.1; `react-router-dom` 7, `vite` 7. `npm audit`: **0**. Backend OSV scan: **1 remaining** (Spring `spring-webmvc` 6.2.19: SSE fragment rendering and XsltView; fixed only in Spring 7). The app uses neither (searched), so it is **not exploitable here**; plan the Spring Boot 4 upgrade. 141 tests and the browser were re-checked after the upgrade |
| SEC-05 | Medium | 30-day login token in browser local storage, no refresh or server-side revocation list (role and active status are now re-checked every request, which limits the harm) | **Open**, design decision (shorter lifetime, refresh tokens) |
| SEC-07 | Low-Medium | Login lockout is in memory per instance (reset on restart, not shared between instances) | **Open**: matters only with more than one instance; use a shared store then |
| SEC-11 | Compliance | Face templates and photos are biometric data: consent, retention and deletion policy | **Open**, policy decision |
| SEC-14 | Info | Production hosting security (TLS certificate, firewall, secrets storage, log shipping) was not part of what could be tested | **Open**, see deployment report |

## Checked and found secure
- **Injection:** SQL-injection strings in login, ID and date/month parameters (no database errors, no data leaks); parameters are bound everywhere; the few concatenated SQL fragments are constant column lists. No raw-HTML rendering in the frontend.
- **Authentication:** JWT `alg=none`, bogus signature, tampered payload, empty/Basic headers all 401; deactivated accounts rejected immediately; brute-force lockout (429 on the 6th failure) works and cannot be bypassed with `X-Forwarded-For`.
- **Authorization:** 10 object-level (IDOR) checks and 6 privilege checks pass; employees cannot reach HR endpoints; HR cannot reach admin accounts; roles follow the database.
- **Exposure:** no actuator, no H2 console, no stack traces, path-traversal attempts refused, CORS refuses foreign origins; file uploads are bounded (1.5 MB photo refused 422, 3 MB refused by the server).
- **Secrets:** none in the working tree or the whole git history (the only hits were translation strings); no keystore, key or `.env` file ever committed.
- **Android app:** `allowBackup="false"`, no cleartext flag, no hard-coded server addresses in the code; permissions are internet, location and camera, which match the features. The signing bridge and WebView code were **not** reviewed in depth.

## Not covered
CSRF review beyond noting the API uses bearer tokens; SSRF (no outbound requests found); dynamic scanning; fuzzing of file uploads; password strength beyond a length of 8; TLS and HTTP/2 configuration (terminated outside the app); Android reverse engineering; a full review of the face-recognition model against spoofing (photo or video attacks).

## Release gates (security)
- Unresolved critical vulnerability: **none known**. This is a statement about what was tested, not a guarantee.
- Authentication or authorization bypass: **none found** after SEC-12.
- Unsafe production configuration: **cannot be cleared without a deployment audit** (see the deployment report).

## Status
**Security: PASS WITH CONDITIONS.** All critical and high findings are fixed and re-tested; independent scanning and a deployment review remain.
