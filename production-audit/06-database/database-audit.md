# Database Audit Report (Phase 5)

- **Application:** Arudra Attender, base commit `2a7cb43` plus the uncommitted fixes in the working tree
- **Date:** 2026-11-11
- **Environment:** MySQL Community 8.4.7 (official zip, run from a scratch folder on port 3307, default isolation REPEATABLE-READ), plus H2 2.2 for development. Application run with `-Xmx350m -XX:+UseSerialGC` as in the Dockerfile.
- **Tools:** `mysql`, `mysqldump`, `information_schema`, MySQL general query log, `jcmd`, the project scripts.
- **Data:** a generated dataset of 814 employees, 200,006 attendance sessions and 200,006 day rows ([seed script](scale-seed-814-employees-200k-sessions.sql)); real application data was not used on MySQL.

## Summary
The application had **never been run on MySQL** (the README said so). Running it found **three defects that only exist on MySQL**, all now fixed and re-tested, plus a performance pattern. The schema is generally sound.

## Defects found only because of MySQL (all fixed)
| ID | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| BUG-15 | **High** (app could not start) | Migration V9 used H2-only syntax (`ALTER COLUMN ... SET NULL`); on MySQL Flyway stopped at version 9 | The H2 script was moved byte for byte to `db/vendor/h2/`; a MySQL script with the same version is in `db/vendor/mysql/`; Flyway picks the folder by database type. A copy of the real H2 database validated all 16 migrations (checksum unchanged) | App now starts on MySQL; 16 migrations applied; real-database copy upgraded |
| BUG-16 | **High** (data integrity) | "One payroll run per month" was checked in code only. 8 parallel requests created **3 runs** on MySQL (H2 hid it) | Migration V16 adds `UNIQUE (period)` on `payroll_runs`; the second insert returns 409 | MySQL: 1 run, 7 refusals; test `ParallelPayrollTest` |
| BUG-17 | Medium | Two different employees punching at the same moment sometimes **deadlocked** (HTTP 500, 3 in about 14,000 requests). Cause: "UPDATE then INSERT if nothing was updated" on the day row takes gap locks | One atomic `INSERT ... ON DUPLICATE KEY UPDATE`; a database busy/deadlock error now returns 503 with `Retry-After` instead of 500 | 0 deadlocks in the next 40,000+ requests |

## Schema review (MySQL information_schema)
| Check | Result |
|---|---|
| Engine and character set | All 29 tables InnoDB, `utf8mb4` |
| Primary keys | Present on every table |
| Foreign keys | 11 exist (employees, leave, payslips to runs, photos to sessions) |
| `_id` columns **without** a foreign key | 12: `payslips.employee_id`, `app_tokens.employee_id/device_id`, `attendance_correction_requests.employee_id`, `employee_face_templates.employee_id`, `lop_overrides.employee_id`, `pairing_codes.employee_id`, `user_device_events.*`, `attendance_sessions.office_location_id/device_id/kiosk_id`. **Not fixed**: employees are never deleted (no delete endpoint), so orphans cannot occur through the application; adding them later needs a clean-up step on existing data first. Recommendation, Low |
| Indexes | Sensible: `(employee_id, work_date)` on sessions and days, status columns, unique tokens/codes/dates. Added `uq_payroll_period`. Not measured: `payslips.employee_id` has no index (the per-employee payslip list scans payslips; small table) |
| Duplicates | Query for more than one session per employee and day found none after the race fix (the earlier duplicates came from the clock-in race, now fixed) |
| NOT NULL / defaults / uniqueness | Reasonable; employee code, email, holiday date and leave code are unique |
| Transactions | Money and approval flows are `@Transactional`; clock-in, clock-out, breaks, kiosk and face-request approval additionally lock the employee row (verified on MySQL REPEATABLE-READ: 3 rounds of 30 parallel punches, exactly 1 success each) |
| Connection pool | Default 10 connections saturated at about 100 very active users; now 20, configurable (`DB_POOL_SIZE`), 5 s wait then 503 (BUG-18, see load report) |

## Query volume (N+1) in payroll
One payroll preview for 814 employees ran **21,838 SQL statements** (about 27 per employee). The pay policy, the holiday list and each employee's off-day rules were re-read for every employee. Fix: a request-scoped cache (`RequestCache`) that only exists while one preview runs. Result on the same MySQL data: **10.9 s to 7.4 s**, and the output was compared row by row for all 813 employees in both pay modes: **0 differences, same net total to the cent** (monthly 23,040,415.78; hourly 21,000,000.00). Payroll still grows linearly (about 9 ms per employee); a batch-loading rewrite would be needed to go much faster, and was not attempted because it risks payroll correctness. `GET /attendance/pending/count` (called on every HR page) now runs a `COUNT`, not the full list.

## Migration safety
- Upgrading an existing database: tested on a **copy of the real H2 database**: Flyway validated 16 migrations, applied V15 and V16, nothing else changed. Your original file was not touched.
- No down-migrations exist (Flyway Community); rollback means restoring the backup (verified, see the backup report).
- V16 fails if two runs already exist for one month (see `docs/operations.md`).

## Limits
EXPLAIN plans were not captured for every query; only the slow path (payroll) was profiled. No test of replication, failover, character-set edge cases, or very large photo tables. The scale data is synthetic (every day identical).

## Status
**Database: PASS after fixes** for MySQL 8.4, with the recommendations above open.
