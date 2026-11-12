# Face data: consent, retention and deletion (DRAFT for review)

**This is a working draft written from what the software actually does. It is not legal advice.** Face data is biometric data and is regulated in many places (for India, the Digital Personal Data Protection Act 2023 and its rules; elsewhere GDPR, BIPA and similar). Have a lawyer review it, fill in the bracketed items, and have the company, not the software vendor, adopt it.

## 1. What the system collects and why
| Data | Purpose | Where it lives |
|---|---|---|
| **Face template**: 128 numbers computed from your face by the browser, not a photo. 8 are taken at enrolment; the system may keep up to 14 per person (see "learning" below) | Recognise you at the punch screen or kiosk so you can clock in and out | Database table `employee_face_templates` |
| **Photo sent with a "face would not match" request** (JPEG, under 300 KB) | HR checks who it is before approving a clock-in or clock-out by hand | `face_requests` |
| **Photo kept with a punch that was flagged for HR** (for example outside the office network) | HR checks the flagged punch | `punch_photos` |
| Match distance, time, location accuracy and office-network result of each punch | Detect wrong or suspicious punches | `attendance_sessions` (not biometric) |

The system does **not** store video, does not use the face for anything but clocking in and out, and does not send face data to any other service.

## 2. Consent (what to tell people and record)
Suggested notice, to be shown and signed or accepted **before** enrolment:

> [Company name] uses face recognition so you can clock in and out. We store a mathematical template of your face, and a photo only when a punch needs HR to check it. We use it only for attendance. Only HR and administrators can see the photos. We delete photos [30] days after HR decides, and we delete everything about your face when you leave or ask us to. Using face recognition is [optional: you may clock in with your employee ID and phone number instead] / [required for the shared kiosk]. Contact [name / email] with questions.

**Gap in the software:** it does not record who consented or when. Keep signed forms or an HR record outside the system. If face use must be optional, the alternatives are the employee portal (ID, phone number, password) and an HR-approved photo request, but a person who has no face template cannot use the kiosk or face punch screen.

## 3. Retention (what the software does today)
| Data | How long it is kept |
|---|---|
| Photos sent with a face request | Deleted automatically 30 days after HR approves or rejects the request |
| Photos kept with flagged punches | Deleted automatically 30 days after HR decides the punch |
| Face templates | **Kept until HR removes them or re-enrols the person** (re-enrolling replaces all templates) |
| Templates added by "learning" | The system adds a new template after a confident punch when your face looks different (other light or angle), up to 14 per person, replacing the oldest learned one. Turn this off with `APP_FACE_LEARN=0` if you do not want extra templates collected |

**Gaps in the software:** deactivating an employee does **not** delete their face data, and nothing deletes templates automatically after a retention period. Today this is a manual step (section 4). If your policy says "delete when employment ends", add that step to your leaving checklist.

## 4. Deleting someone's face data
HR or an admin opens the employee (HR console, Employees, the person, Access) and chooses **Remove face data**. This deletes the person's templates, their face-request photos and their punch photos. Their hours and pay are not changed. The same action is available to scripts as `DELETE /api/hr/employees/{id}/face`. Admin accounts can only be changed by admins.
Backups: the database backup contains face data too. Deleted data disappears from new backups, but older backups keep it until they expire: set the backup retention to match your policy (for example 30 to 90 days) and say so in the notice.

## 5. Who can see it
Only HR and admin accounts can view face-request and punch photos; employees cannot see anyone's face data, including their own photos. Templates are not shown to anyone through the application. Database administrators and anyone with a backup file can read them: restrict and encrypt access.

## 6. Security measures in place and not in place
In place: access limited to HR/admin roles, role checked against the database on every request, lockout after repeated failures, photos size-limited, HTTPS recommended (see `docs/operations.md`), automatic photo deletion.
Not in place: encryption of the face columns inside the database (rely on disk and backup encryption), an audit log of who viewed a photo, a spoofing defence against a printed photo or video of a face (the screen asks the person to turn their head, which is a basic check, not a guarantee). Treat face recognition as convenience, not as proof of identity; flagged punches go to HR for that reason.

## 7. Your rights and how requests are handled
People can ask what is held about them, ask for it to be deleted, or withdraw consent. Suggested handling: [contact], answer within [30] days, use section 4 to delete, confirm in writing. The system cannot export a person's face template in a readable form (it is meaningless outside the system); a photo can be shown to the person by HR while it exists.

## 8. Decisions this company must make
1. Is face use optional or required, and what is the alternative for people who refuse?
2. How long are templates kept after someone leaves ([0 days / 30 days / other])?
3. How long are backups kept?
4. Who is the contact person for requests?
5. Does a minor, or anyone under a special rule, work here? (Extra consent rules may apply.)
6. Where is the data hosted (country), and is there a written agreement with the host?
