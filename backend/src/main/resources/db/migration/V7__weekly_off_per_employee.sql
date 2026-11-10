-- Weekly off days per employee. No rule = the company default (Pay settings). off_days is a list like 'WED' or 'TUE,SUN';
-- 'DEFAULT' means "back to the company default" from valid_from on. The newest rule whose valid_from has passed applies.
CREATE TABLE employee_off_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  off_days VARCHAR(40) NOT NULL,
  valid_from DATE NOT NULL,
  source VARCHAR(12) NOT NULL,
  set_by BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eor_emp FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE INDEX ix_eor_emp ON employee_off_rules (employee_id, valid_from);

-- An employee asks to change their weekly off; it only takes effect if HR approves.
CREATE TABLE off_day_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  off_days VARCHAR(40) NOT NULL,
  effective_from DATE NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  decided_by BIGINT,
  decided_at TIMESTAMP NULL,
  decision_note VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_odr_emp FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE INDEX ix_odr_status ON off_day_requests (status, employee_id);
