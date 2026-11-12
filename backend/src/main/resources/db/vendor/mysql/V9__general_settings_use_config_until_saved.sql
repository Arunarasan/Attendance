-- MySQL version of the H2 script with the same version number (db/vendor/h2/V9...). H2 has ALTER COLUMN ... SET NULL; MySQL needs MODIFY.
-- Punch rules stay NULL until HR saves them; NULL means "use the value from application.yml".
ALTER TABLE general_settings MODIFY geo_grace_meters INT NULL;
ALTER TABLE general_settings MODIFY max_accuracy_margin_meters INT NULL;
ALTER TABLE general_settings MODIFY kiosk_min_gap_seconds INT NULL;
ALTER TABLE general_settings MODIFY phone_face_required BOOLEAN NULL;
UPDATE general_settings SET geo_grace_meters = NULL, max_accuracy_margin_meters = NULL, kiosk_min_gap_seconds = NULL, phone_face_required = NULL WHERE id = 1;
