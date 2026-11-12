-- "One payroll run per month" was only checked in code (read, then insert), so two simultaneous requests could both pass.
-- The database now refuses the second one. Found on MySQL: 8 parallel requests created 3 runs.
ALTER TABLE payroll_runs ADD CONSTRAINT uq_payroll_period UNIQUE (period);
