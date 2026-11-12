# Security Findings so far (preliminary; the full Phase 6 audit is NOT done)

- **Commit:** `2a7cb43`; **Date:** 2026-11-11. Sources: Phase 1 code review, Phase 2 and 4 live probing on disposable instances. No SAST/DAST/dependency scanner has been run yet (Semgrep, ZAP, `npm audit`, Trivy are not installed).
- Secrets: none printed here. The default values quoted are the app's own public defaults from `application.yml`.

| ID | Severity | Finding | Status |
|---|---|---|---|
| **SEC-01** | **Critical (conditional)** | **Admin takeover if `APP_JWT_SECRET` is not set.** `application.yml` falls back to a public default secret. **Verified:** on a throwaway instance started without `APP_JWT_SECRET`, a token I signed with that default (claims `role=ADMIN`, `sub=1`) was accepted by `/api/hr/employees` and returned the full employee list, with no login and no password. The Dockerfile and README do not require the variable for the default (H2) setup, so any deployment that forgets it is open to anyone who has read the source. | Verified, unfixed |
| **SEC-02** | High | Default admin `admin@example.com` / `ChangeMe123!` is seeded on first start and was still valid on the live instance (:8080). | Verified, unfixed |
| **SEC-03** | High | Concurrent clock-ins create duplicate sessions and 500 errors (integrity). See the API report, A-RACE. | Verified, unfixed |
| SEC-04 | Medium-High | The HR role can create, modify and deactivate ADMIN accounts (privilege escalation inside the organisation). | Verified, unfixed |
| SEC-05 | Medium | 30-day JWT in `localStorage`, no server-side revocation or refresh (only an `active` check). XSS or a stolen device keeps access for up to 30 days. | Code review |
| SEC-06 | Medium | Missing input validation: oversize strings and numbers cause HTTP 500; negative rate, future correction and latitude 999 are accepted (BUG-03/05/06/11). | Verified |
| SEC-07 | Low-Medium | Login lockout is in memory per instance (lost on restart, not shared across instances), keyed by ID+IP. | Code review |
| SEC-08 | Low | `X-Forwarded-For` first entry is trusted when `APP_TRUST_PROXY=true`; behind a proxy that appends rather than replaces, a client can spoof its IP (affects the office-network check and throttles). | Code review, conditional |
| SEC-09 | Low | Missing HSTS, CSP and Referrer-Policy headers. | Verified |
| SEC-10 | Low | Raw Tomcat/Spring default error bodies (HTML 400, JSON 405/500 with path) instead of the app's error format. No stack traces leak. | Verified |
| SEC-11 | Compliance | Biometric data (face templates, photos) needs a consent, retention and deletion policy; templates are kept until re-enrolment. | Code review |

## Checked and found secure (this phase)
SQL injection (login and parameters); JWT `alg=none` and forgery with a *different* secret; IDOR on leave, payslips, pay settings, balances and password; role escalation by employees; CORS from foreign origins; `/actuator` and `/h2-console` exposure; login lockout and `X-Forwarded-For` bypass; no `dangerouslySetInnerHTML` in the frontend (script text stored in a name comes back as JSON text and the UI renders it escaped).

## Not yet done (Phase 6 proper)
CSRF review (bearer tokens, so low risk), SSRF (no outbound fetches found so far), file-upload fuzzing, dependency CVE scan, Semgrep rules, ZAP scan, secrets scan of git history, HTTPS/TLS configuration, password policy beyond length 8 (no complexity or breach check).

## Release gates touched
An unresolved **critical** issue (SEC-01 as shipped defaults) and a **data-integrity** issue (SEC-03) mean a GO is not possible today.
