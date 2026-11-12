# Performance, Load, Stress and Soak Report (Phases 7 and 8 of the plan)

- **Application:** Arudra Attender (working tree, Spring Boot 3.5.16), **Date:** 2026-11-11
- **System under test:** the backend on MySQL 8.4.7 with 814 employees and 200,000 sessions, JVM `-Xmx350m -XX:+UseSerialGC`, Hikari pool 20.
- **Load tool:** a small dependency-free Node generator ([load-generator.cjs](load-generator.cjs)); k6 was **not** installed (it needs a download I did not request approval for). It models virtual users with 100 ms think time doing a mix: 30% `GET /me`, 25% `/me/today`, 15% `/me/timesheet`, 8% HR employee list, 6% pending count, 4% register, 12% punch in/out.
- **Important limit:** the load generator, MySQL and the app all ran on **one developer machine**, so they competed for CPU. Real hosting will differ; treat the numbers as a lower bound and repeat on production-like hardware.
- A 100 ms think time is far more aggressive than real people. One virtual user here is roughly the load of 20-50 real users.

## Ramp results ([raw](load-ramp-results.txt))
| Virtual users | Requests/s | Average | p50 | p90 | p95 | p99 | Max | Errors |
|---|---|---|---|---|---|---|---|---|
| 1 | 7.6 | 25 ms | 12 | 37 | 132 | 155 | 155 | 0% |
| 10 | 80 | 19 | 8 | 80 | 95 | 125 | 275 | 0% |
| **50** | **375** | 30 | 8 | 127 | **170** | 233 | 370 | 0% |
| 100 | 286 | 243 | 190 | 555 | 676 | 876 | 1,379 | 0% |
| 250 | 220 | 1,005 | 935 | 1,854 | 2,158 | 2,883 | 4,921 | 0% |
| 500 | 160 | 2,782 | 2,702 | 4,257 | 4,739 | 5,750 | 7,491 | 0% |

**Reading it:** the knee is between 50 and 100 very active users (about 375 requests per second on this machine). Beyond that the server queues work: latency rises and throughput falls, but **no requests fail up to 500 simultaneous users**. Measured saturation is a statement about this machine, not a promised capacity.

## What the first two runs found (fixed)
| Run | Finding | Evidence | Fix |
|---|---|---|---|
| First ramp | 3 punches in about 14,000 failed with HTTP 500: MySQL deadlock between two employees | [first run](load-first-run-before-pool-fix.txt) | BUG-17 (atomic upsert) |
| Second ramp, default pool of 10 | At 100 users requests waited the full **30 s** for a database connection and then failed with **500** (0.5% errors, p99 30 s); at 250 users **37% errors** | [second run](load-second-run-pool-exhaustion.txt) | BUG-18: pool 20 (configurable) and a 5 s wait that answers **503 with Retry-After** instead of 500 after 30 s. The larger pool never saturated in the third ramp, so the 503 path was **not exercised under real overload** (it has no automated test either); only the 20-connection pool was proven |
| Third ramp (table above) | 0% errors at every level | [ramp](load-ramp-results.txt) | |

## Soak (5 minutes, 40 constant users, [results](soak-5min-results.txt), [memory](soak-memory.txt))
- 39,504 requests, **0% errors**, no server errors in the log.
- Memory: live heap after a forced garbage collection 113 MB (at start), then 147 MB, 53 MB, 27 MB, 25 MB; metaspace flat at 47.7 MB; process size flat at about 390 MB. **No growth, no leak seen.** The 10 s maximum in that run came from my own forced full-GC probes, not from the app.
- 5 minutes is a short soak. A leak that grows by a few MB per hour would not show. Run 8-24 hours before launch if the deployment will not restart regularly.

## Single-request latency at data scale (MySQL, 814 employees / 200k sessions)
| Request | Median |
|---|---|
| `/api/me`, `/api/hr/payroll/runs`, `/api/hr/leave/requests` | 4-5 ms |
| `/api/hr/employees` (all 814) | 76 ms (50 per page with `?limit=50`) |
| `/api/hr/attendance/pending` (686 pending) | 105 ms |
| `/api/hr/attendance/register?date=` | 78 ms |
| **Payroll preview, 814 employees** | **7.4 s** (was 10.9 s), about 9 ms per employee |

## Bottlenecks and recommendations
1. **Payroll preview is linear in employees** (about 9 ms each): fine for hundreds, about a minute at 5,000+. Give the proxy a longer timeout, or run payroll as a background job, if you expect thousands of employees.
2. Database connection pool is the first limit under heavy load: tune `DB_POOL_SIZE` against your MySQL `max_connections`.
3. The HR console fetches full lists on every refresh; they are now capped at 1,000 rows (`?limit=&offset=`, `X-Total-Count`), but the screens do not page yet.

## Not done
No test at an "expected peak" for your real user count (it was not given), no stress above 500 users, no long soak, no network latency or TLS overhead, no test on production hardware.

## Status
**Performance: PASS for the measured scale** (hundreds of concurrent users, up to 800 employees), with the payroll scaling limit documented.
