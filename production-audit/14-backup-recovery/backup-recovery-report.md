# Backup and Recovery Report (Phase 12 item 14)

- **Date:** 2026-11-11. **Environment:** MySQL 8.4.7 on a developer machine; application started from the restored copy.
- This was a **release gate** that was unmet at the start of the audit (no procedure existed in the repository). It is now verified for MySQL.

## Drill performed
| Step | Result |
|---|---|
| Data | 812 employees, 200,003 attendance sessions and day rows, 29 tables (generated test data) |
| Backup | `mysqldump --single-transaction --routines --triggers`, the app stayed online: **2 s, 48 MB** |
| Restore into a brand-new empty database | **11 s** |
| Compare every table | **29 of 29 identical**: same row count and same `CHECKSUM TABLE`; no mismatches |
| Run the application against the restored copy | Starts; Flyway: "schema is up to date, no migration necessary"; admin login works; `X-Total-Count: 812` and pending count 686 match the original |
| Smaller run earlier the same day | Same result with the empty-ish schema (29/29 identical) |

The exact commands are in [docs/operations.md](../../docs/operations.md).

## Upgrade path (a kind of recovery)
A **copy** of the real H2 database was opened with the new code: 16 migrations validated, 2 applied, the admin account flagged for a password change. The original file was not touched.

## Gaps
- **No automatic schedule**, retention policy, off-site copy or encryption exists; the guide describes them but nothing runs them. Face photos and templates are in the dump: encrypt it.
- **Point-in-time recovery** (binary logs) was not tested; a daily dump loses up to a day of attendance on failure.
- The restore was tested **on the same machine**, not on a different server, and not with a database user that has only restricted rights.
- The default H2 file database has no tested restore (copy the `data` folder with the app stopped); use MySQL for production.
- Recovery time objective: restoring about 50 MB took 11 s; time for a real production size is unmeasured.

## Status
**Backup and recovery: VERIFIED for a MySQL dump and restore** (release gate met for this procedure). Automation and monitoring of the backups are still to be set up by whoever hosts it.
