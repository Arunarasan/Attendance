-- Language employees see until they pick their own: en, ta or hi.
ALTER TABLE general_settings ADD COLUMN default_language VARCHAR(2) NOT NULL DEFAULT 'en';
