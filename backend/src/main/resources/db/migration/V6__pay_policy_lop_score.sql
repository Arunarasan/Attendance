-- Pay policy (one row): working-days basis, overtime thresholds, loss-of-pay rules and honour-score weights.
-- Defaults keep the earlier behaviour: loss-of-pay rules and the bonus are OFF until HR turns them on.
CREATE TABLE pay_policy (
  id INT PRIMARY KEY,
  working_days_basis VARCHAR(12) NOT NULL DEFAULT 'SCHEDULED',
  ot_after_minutes INT NOT NULL DEFAULT 0,
  ot_daily_cap_minutes INT NOT NULL DEFAULT 0,
  lop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  grace_minutes INT NOT NULL DEFAULT 10,
  half_day_min_minutes INT NOT NULL DEFAULT 240,
  shift_start TIME NOT NULL DEFAULT '09:00:00',
  late_grace_minutes INT NOT NULL DEFAULT 10,
  late_count_for_half_day INT NOT NULL DEFAULT 3,
  w_attendance INT NOT NULL DEFAULT 40,
  w_punctuality INT NOT NULL DEFAULT 25,
  w_hours INT NOT NULL DEFAULT 20,
  w_discipline INT NOT NULL DEFAULT 15,
  bonus_min_score INT NOT NULL DEFAULT 0,
  bonus_amount DECIMAL(12,2) NOT NULL DEFAULT 0
);
INSERT INTO pay_policy (id) VALUES (1);

-- Per-employee pay settings. No row = company defaults (pay mode follows the payroll run, no allowances, overtime allowed).
CREATE TABLE employee_pay (
  employee_id BIGINT PRIMARY KEY,
  pay_mode VARCHAR(8),
  allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
  ot_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_epay_emp FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- HR can replace the loss of pay computed for one day, with a reason.
CREATE TABLE lop_overrides (
  employee_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  lop_days DECIMAL(3,1) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  set_by BIGINT,
  set_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id, work_date)
);

ALTER TABLE payslips ADD COLUMN lop_days DECIMAL(5,1) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN lop_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN allowances DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN bonus DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN pay_mode VARCHAR(8);
ALTER TABLE payslips ADD COLUMN score INT;
