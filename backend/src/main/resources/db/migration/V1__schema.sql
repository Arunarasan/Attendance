CREATE TABLE employees (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(32),
  password_hash VARCHAR(100) NOT NULL,
  role VARCHAR(16) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  attendance_method VARCHAR(16) NOT NULL DEFAULT 'GEO',
  device_binding_mode VARCHAR(8),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_locations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  radius_meters INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE attendance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  check_in TIMESTAMP NULL,
  check_out TIMESTAMP NULL,
  break_minutes INT NOT NULL DEFAULT 0,
  worked_minutes INT NOT NULL DEFAULT 0,
  overtime_minutes INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_att UNIQUE (employee_id, work_date),
  CONSTRAINT fk_att_emp FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE attendance_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  clock_in TIMESTAMP NOT NULL,
  clock_out TIMESTAMP NULL,
  break_started TIMESTAMP NULL,
  break_minutes INT NOT NULL DEFAULT 0,
  source VARCHAR(16) NOT NULL,
  verification_method VARCHAR(24),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason VARCHAR(255),
  latitude DOUBLE,
  longitude DOUBLE,
  accuracy_meters DOUBLE,
  distance_meters DOUBLE,
  office_location_id BIGINT,
  device_id BIGINT,
  device_verified BOOLEAN,
  kiosk_id BIGINT,
  face_distance DOUBLE,
  approval_status VARCHAR(12) NOT NULL,
  approved_by BIGINT,
  approved_at TIMESTAMP NULL,
  overtime_alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_sess_emp FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE INDEX ix_sess_emp_date ON attendance_sessions (employee_id, work_date);
CREATE INDEX ix_sess_status ON attendance_sessions (approval_status);

CREATE TABLE user_devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  public_key TEXT NOT NULL,
  label VARCHAR(120),
  status VARCHAR(12) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dev_emp FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE user_device_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  device_id BIGINT,
  event VARCHAR(32) NOT NULL,
  detail VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE app_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL
);

CREATE TABLE pairing_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  code_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL
);

CREATE TABLE attendance_kiosks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code_hash VARCHAR(64),
  code_expires_at TIMESTAMP NULL,
  token_hash VARCHAR(64),
  verify_mode VARCHAR(8) NOT NULL DEFAULT 'EITHER',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_face_templates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  descriptor TEXT NOT NULL
);

CREATE TABLE attendance_correction_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  original_in TIMESTAMP NULL,
  original_out TIMESTAMP NULL,
  requested_in TIMESTAMP NOT NULL,
  requested_out TIMESTAMP NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  decided_by BIGINT,
  decided_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nonces (
  nonce VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL
);

CREATE TABLE payroll_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period VARCHAR(7) NOT NULL,
  mode VARCHAR(8) NOT NULL,
  created_by BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payslips (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  period VARCHAR(7) NOT NULL,
  regular_hours DECIMAL(8,2) NOT NULL,
  overtime_hours DECIMAL(8,2) NOT NULL,
  gross DECIMAL(12,2) NOT NULL,
  adjustments DECIMAL(12,2) NOT NULL DEFAULT 0,
  net DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_ps_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id)
);
