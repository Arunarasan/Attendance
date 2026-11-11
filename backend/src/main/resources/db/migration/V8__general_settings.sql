-- General settings HR can edit without a deploy: company profile and punch rules.
-- Defaults match the values that used to live only in application.yml.
CREATE TABLE general_settings (
  id INT PRIMARY KEY,
  company_name VARCHAR(120) NOT NULL DEFAULT 'Arudra',
  company_address VARCHAR(300) NOT NULL DEFAULT '',
  company_phone VARCHAR(30) NOT NULL DEFAULT '',
  company_email VARCHAR(120) NOT NULL DEFAULT '',
  geo_grace_meters INT NOT NULL DEFAULT 20,
  max_accuracy_margin_meters INT NOT NULL DEFAULT 250,
  kiosk_min_gap_seconds INT NOT NULL DEFAULT 120,
  phone_face_required BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO general_settings (id) VALUES (1);
