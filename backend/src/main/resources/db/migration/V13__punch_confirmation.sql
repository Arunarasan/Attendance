-- When a punch fails a check (location, WiFi, face, phone) the employee decides: fix it, or send it to HR with a note.
-- on_check_fail: ASK (employee chooses), BLOCK (refuse the punch) or FLAG (record and flag for HR). NULL = use application.yml.
ALTER TABLE general_settings ADD COLUMN on_check_fail VARCHAR(5);
ALTER TABLE attendance_sessions ADD COLUMN employee_note VARCHAR(300);
