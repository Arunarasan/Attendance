# Operations guide

What to set, how to back up and restore, how to check the app is healthy. The backup and restore steps below were run end to end on MySQL 8.4 with 812 employees and about 200,000 attendance sessions: a 48 MB dump took 2 seconds, the restore took 11 seconds, all 29 tables matched by checksum, and the application started and served correct data from the restored copy.

## Before the first real use
1. **Set `APP_JWT_SECRET`** to 32 or more random characters (for example `openssl rand -base64 48`). Without it the app uses a random secret per start, so everyone is signed out on every restart and several instances cannot share sessions.
2. **Set `APP_ADMIN_EMAIL` and `APP_ADMIN_PASSWORD`** before the first start, or sign in with the documented default and change the password when asked. An admin or HR account that still uses the default password is blocked from everything except changing it.
3. **Use MySQL**, not the default file database: `SPRING_PROFILES_ACTIVE=mysql`, `DB_URL`, `DB_USER`, `DB_PASSWORD`. Create the database with `utf8mb4`.
4. **Serve over HTTPS** (the API sends `Strict-Transport-Security`). Behind a reverse proxy set `APP_TRUST_PROXY=true` and `APP_TRUSTED_PROXY_HOPS` to the number of proxies you control.
5. Set `APP_CORS` to the exact address of the frontend.
6. Point your host's health check at `GET /api/public/health`.
7. The Dockerfile now creates and switches to a non-root user and keeps the default file database in `/app/data` (mount a volume there if you use it). **This was not built or run during the audit because Docker is not installed on the test machine: build it once and check the container starts before relying on it.**

## Backup (MySQL)
Run daily from a scheduler and copy the file off the server. It takes a consistent snapshot while the app stays online.

```bash
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF -u backup_user -p attendance > attendance-$(date +%F).sql
```

Keep at least 14 daily copies and one monthly copy, stored somewhere other than the database server. Face photos and face templates are inside the database, so the dump contains personal biometric data: encrypt the file and restrict access.

## Restore
```bash
mysql -u root -p -e "CREATE DATABASE attendance_restore CHARACTER SET utf8mb4"
mysql -u root -p attendance_restore < attendance-2026-11-11.sql
```
Then start the app with `DB_URL` pointing at `attendance_restore` (or rename it). Flyway reports "Schema is up to date" when the restore is complete. To prove a backup is good without touching production, restore it into a scratch database and compare row counts and `CHECKSUM TABLE` for each table, as the audit did. **Test a restore at least once a quarter.**

## Default file database (development only)
Stop the app and copy the whole `data/` folder, or run `SCRIPT TO 'backup.sql'` from the H2 console. The `*.trace.db` files in that folder are diagnostic logs and can be deleted.

## Upgrading
Take a backup first. The app applies new migrations on start. A database created by an older version upgrades in place (checked against a copy of a real H2 database: migrations 15 and 16 applied, nothing else changed). If migration 16 fails, two payroll runs exist for the same month: delete the duplicate run and its payslips, then start again.

## Capacity (measured, not promised)
On one developer machine, shared with MySQL and the load generator, with `-Xmx350m`: about 375 requests per second at 50 very active users (p95 170 ms), no errors up to 500 simultaneous users (p95 4.7 s at 500), and a 5-minute soak of 39,500 requests with no errors and no memory growth. Generating payroll takes about 9 ms per employee (7 seconds for 814 employees), so a company above a few thousand employees should expect a payroll preview of a minute or more and needs a longer proxy timeout. These numbers are a starting point: repeat the load test on your real hosting.
