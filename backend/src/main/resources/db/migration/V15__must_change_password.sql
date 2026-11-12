-- Accounts that still use the shipped default password must change it before doing anything else.
ALTER TABLE employees ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
