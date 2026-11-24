-- Per-employee switches for the attendance checks. All on = today's behaviour.
ALTER TABLE employees ADD COLUMN require_location BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN require_wifi BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN allow_kiosk BOOLEAN NOT NULL DEFAULT TRUE;
