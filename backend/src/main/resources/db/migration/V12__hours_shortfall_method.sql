-- Monthly salary paid by hours: the salary covers (working days - free off days) x standard hours.
-- Fewer hours cost the missing hours at the hourly rate; more hours earn extra pay. 'DAYS' keeps the earlier full/half-day loss of pay.
ALTER TABLE pay_policy ADD COLUMN shortfall_method VARCHAR(5) NOT NULL DEFAULT 'DAYS';
ALTER TABLE pay_policy ADD COLUMN free_off_days INT NOT NULL DEFAULT 1;

ALTER TABLE payslips ADD COLUMN shortfall_method VARCHAR(5);
ALTER TABLE payslips ADD COLUMN required_hours DECIMAL(7,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN shortfall_hours DECIMAL(7,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN shortfall_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN extra_hours DECIMAL(7,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN extra_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
