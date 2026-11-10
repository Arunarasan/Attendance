-- Payroll settings (one row), editable by HR. Defaults match the earlier built-in behaviour.
CREATE TABLE payroll_settings (
  id INT PRIMARY KEY,
  standard_daily_hours INT NOT NULL,
  weekly_off_days VARCHAR(40) NOT NULL,
  overtime_multiplier DECIMAL(4,2) NOT NULL,
  default_mode VARCHAR(8) NOT NULL
);
INSERT INTO payroll_settings (id, standard_daily_hours, weekly_off_days, overtime_multiplier, default_mode)
VALUES (1, 8, 'SUN', 1.50, 'HOURLY');

CREATE TABLE holidays (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE leave_types (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(12) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT TRUE,
  annual_quota DECIMAL(5,1) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO leave_types (code, name, paid, annual_quota) VALUES ('CL', 'Casual leave', TRUE, 12);
INSERT INTO leave_types (code, name, paid, annual_quota) VALUES ('SL', 'Sick leave', TRUE, 12);
INSERT INTO leave_types (code, name, paid, annual_quota) VALUES ('EL', 'Earned leave', TRUE, 15);
INSERT INTO leave_types (code, name, paid, annual_quota) VALUES ('LOP', 'Leave without pay', FALSE, 0);

CREATE TABLE leave_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  leave_type_id BIGINT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  half_day BOOLEAN NOT NULL DEFAULT FALSE,
  days DECIMAL(5,1) NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  decided_by BIGINT,
  decided_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lr_emp FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_lr_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
);
CREATE INDEX ix_lr_emp_start ON leave_requests (employee_id, start_date);
CREATE INDEX ix_lr_status ON leave_requests (status);

-- Deductions are rules HR switches on. The seeded ones are examples only (inactive): rates and limits differ by country,
-- state and year, so check them before turning one on.
CREATE TABLE deduction_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  amount DECIMAL(10,4) NOT NULL,
  wage_cap DECIMAL(12,2),
  min_gross DECIMAL(12,2),
  max_gross DECIMAL(12,2),
  active BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO deduction_rules (name, kind, amount, wage_cap, min_gross, max_gross, active) VALUES ('Provident fund (example)', 'PERCENT', 12, 15000, NULL, NULL, FALSE);
INSERT INTO deduction_rules (name, kind, amount, wage_cap, min_gross, max_gross, active) VALUES ('Health insurance (example)', 'PERCENT', 0.75, NULL, NULL, 21000, FALSE);
INSERT INTO deduction_rules (name, kind, amount, wage_cap, min_gross, max_gross, active) VALUES ('Professional tax (example)', 'FIXED', 200, NULL, 15000, NULL, FALSE);

ALTER TABLE payslips ADD COLUMN paid_leave_days DECIMAL(5,1) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN unpaid_leave_days DECIMAL(5,1) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN holiday_days DECIMAL(5,1) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN credit_hours DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN deductions DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN deduction_detail VARCHAR(1000);
