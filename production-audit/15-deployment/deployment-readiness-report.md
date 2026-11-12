# Deployment Readiness Report (Phase 10)

- **Date:** 2026-11-11. **Method:** reading the Dockerfile and configuration, running the app on MySQL with the production-style JVM options, checking headers and endpoints, and the guide in [docs/operations.md](../../docs/operations.md). **No real production environment was available**, so hosting-level items are unverified.

## Checked and done
| Item | Result |
|---|---|
| Environment variables | Documented. `APP_JWT_SECRET` has no default (random per start if unset; short or old-default secrets refuse to start). New: `APP_TRUST_PROXY`, `APP_TRUSTED_PROXY_HOPS`, `DB_POOL_SIZE`, `DB_CONNECT_TIMEOUT_MS`, `APP_ENFORCE_PASSWORD_CHANGE` |
| Database configuration | MySQL profile works; all 16 migrations apply; upgrade of an existing H2 database works (on a copy) |
| Default credentials | The seeded admin must change the default password before the app is usable (verified in the browser and on a copy of your real database) |
| Debug and diagnostic exposure | No actuator, no H2 console, no stack traces in responses; the API sets HSTS, CSP, Referrer-Policy, nosniff, frame-deny, no-store |
| Health check | `GET /api/public/health`: 200 when the database answers, 503 when not (test added) |
| Resource limits | The Dockerfile sets `-Xmx350m`; run with that setting, a 5-minute soak and a ramp to 500 users completed without errors or memory growth |
| Container hardening | Dockerfile: the jar name is no longer hard-coded; the container user is non-root; a note names the health-check path. **Not built or run: Docker is not installed on the test machine** |
| CORS | Refuses foreign origins; allows the origin in `APP_CORS` |
| Logging | Writes to the console; scheduled jobs log warnings. No structure, no correlation IDs |
| Backup | Verified procedure, not scheduled (see the backup report) |

## Not checked (needs the real environment)
- **HTTPS and certificate, domain, firewall**, reverse-proxy timeouts (payroll preview takes about 7 s per 800 employees), HTTP/2.
- **Process restart policy**, rollback procedure (no down-migrations; rollback means restoring a backup and redeploying the previous image), blue/green or zero-downtime deploys.
- **Monitoring and alerting**: none exists. No error tracking (Sentry or similar), no uptime check, no log shipping, no alert when backups fail.
- **CI/CD**: none. Nothing runs the 141 tests automatically before a deploy.
- **The static frontend host** (the `_redirects` file suggests a static host such as Netlify or Render) needs its own security headers (CSP, HSTS, frame options).
- **The Docker image build** and a container smoke test.

## Gate: "production deployment configuration is safe"
**NOT MET YET.** The application side is hardened; the environment side has not been audited. Clear it by: building and running the image, deploying to a staging host with HTTPS, setting the variables above, running the smoke tests in the operations guide, and adding basic monitoring.

## Status
**Deployment: PARTIAL** (application ready; infrastructure unverified).
