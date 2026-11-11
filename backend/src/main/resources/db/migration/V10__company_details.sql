-- Fuller company profile: legal name, structured address, website and tax IDs.
ALTER TABLE general_settings ADD COLUMN legal_name VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE general_settings ADD COLUMN address_line2 VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE general_settings ADD COLUMN city VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE general_settings ADD COLUMN state VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE general_settings ADD COLUMN pincode VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE general_settings ADD COLUMN website VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE general_settings ADD COLUMN gstin VARCHAR(15) NOT NULL DEFAULT '';
ALTER TABLE general_settings ADD COLUMN pan VARCHAR(10) NOT NULL DEFAULT '';
