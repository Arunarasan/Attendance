-- Punch rules stay NULL until HR saves them; NULL means "use the value from application.yml".
ALTER TABLE general_settings ALTER COLUMN geo_grace_meters SET NULL;
ALTER TABLE general_settings ALTER COLUMN max_accuracy_margin_meters SET NULL;
ALTER TABLE general_settings ALTER COLUMN kiosk_min_gap_seconds SET NULL;
ALTER TABLE general_settings ALTER COLUMN phone_face_required SET NULL;
UPDATE general_settings SET geo_grace_meters = NULL, max_accuracy_margin_meters = NULL, kiosk_min_gap_seconds = NULL, phone_face_required = NULL WHERE id = 1;
