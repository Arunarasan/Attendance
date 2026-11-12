# Code Quality Report (Phase 12 item 13)

- **Date:** 2026-11-11. **Method:** reading the code while fixing it, line counts, dependency review. **No static-analysis tool was run** (SonarQube, SpotBugs, ESLint were not installed or configured in the project).

## Size and tests
| | |
|---|---|
| Backend main code | 4,549 lines of Java across about 45 files |
| Backend tests | 2,486 lines, **25 test classes, 141 tests, all passing** (106 existed; 35 were added by this audit as regression tests; none of the originals changed) |
| Frontend | about 5,100 lines (TypeScript, TSX, CSS); **13 automated tests added after this report was written** (round 5), none existed before |
| CI | none when audited; a workflow was added in round 5 (.github/workflows/ci.yml) and has not run on GitHub yet |
| Largest files | `Portal.tsx` 719 lines, `PayAdmin.tsx` 588, `TimeService.java` 381, `PayrollService.java` 296 |

## Observations
- **Strengths:** consistent layering (controllers, services, plain SQL with bound parameters), small focused services, readable names and helpful comments, Flyway migrations, strong end-to-end backend tests that exercise the real HTTP API, payroll maths covered by unit tests, no TODO/FIXME markers, no raw-HTML rendering.
- **Weaknesses:** two very large React files mixing many concerns; no frontend tests when audited (13 added in round 5); no CI when audited (a workflow was added in round 5); payroll does many small queries per employee (improved with a request cache, still linear); `M.java` holds most data records in one file; SQL text is spread through the services (fine at this size).
- **Duplicated or unused code:** not measured; no tool was run.
- **Hard-coded values:** pay and punch rules are configurable; a few limits live in code (lockout 5 tries / 15 min, login token 30 days, photo 300 KB, 20 unrecognised faces per 5 minutes).
- **Dependency hygiene after this audit:** `npm audit` 0; backend OSV scan 1 non-exploitable advisory (Spring 6.2.x; fixed only in Spring 7). Spring Boot 3.5 is itself near the end of its open-source support: plan Boot 4.
- Line endings are mixed (CRLF and LF) across the repository; harmless but noisy in diffs.

## Recommendations (none done)
Add a GitHub Actions workflow (backend tests, frontend build, `npm audit`); add SpotBugs or Sonar and ESLint; split `Portal.tsx` and `PayAdmin.tsx`; add a few frontend tests for login, the forced password screen and payroll preview; add a `.gitattributes` to settle line endings.

## Status
**Code quality: ACCEPTABLE** (readable, well tested at the API level) with the gaps above.
