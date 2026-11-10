CREATE TABLE face_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  action VARCHAR(3) NOT NULL,
  requested_at TIMESTAMP NOT NULL,
  photo LONGBLOB NOT NULL,
  latitude DOUBLE,
  longitude DOUBLE,
  accuracy_meters DOUBLE,
  client_ip VARCHAR(64),
  bssid VARCHAR(32),
  context VARCHAR(255),
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  decided_by BIGINT,
  decided_at TIMESTAMP NULL,
  CONSTRAINT fk_fr_emp FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE INDEX ix_fr_status ON face_requests (status);
