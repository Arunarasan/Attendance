# Attendance and payroll

Hours-based attendance with soft verification, an HR approval queue, a shared office kiosk, a pair-once personal phone app, and payroll that derives from approved hours.

```
backend/      Spring Boot 3.3, Java 17, Flyway, JDBC (H2 for dev, MySQL for production)
frontend/     React + TypeScript (Vite): employee portal, HR console, kiosk, app pairing
android-app/  Kotlin WebView shell with a hardware-Keystore signing bridge
```

## Run it

```bash
cd backend && mvn spring-boot:run          # http://localhost:8080 (H2 file DB in backend/data)
cd frontend && npm install && npm run dev  # http://localhost:5173, proxies /api to the backend
```

First sign-in: `admin@example.com` / `ChangeMe123!`. **Change it** (HR console, Employees, or set `APP_ADMIN_EMAIL` / `APP_ADMIN_PASSWORD` before the first start).

MySQL: `SPRING_PROFILES_ACTIVE=mysql DB_URL=jdbc:mysql://host:3306/attendance DB_USER=... DB_PASSWORD=... APP_JWT_SECRET=<32+ random chars> mvn spring-boot:run`. The Flyway script is plain MySQL-compatible SQL but has only been run on H2 so far.

Face models (about 7 MB) are served from `frontend/public/models` and loaded only on the kiosk and enrolment screens.

Tests: `cd backend && mvn test` (57 tests: payroll maths, network matching, and end-to-end HTTP flows through every path below).

## How it works

Every clock-in to clock-out pair is a **session**. Sessions roll up into one **day** row; payroll reads only that.

| Path | Entry point | Result |
|---|---|---|
| Portal (any browser) | `/` after login | Location and phone-key checks run; failures flag the session, never block it |
| Personal phone app | HR creates a code (Employees, App code), phone pairs once at `/app/pair` | Device token plus an ECDSA signature over a server nonce on every punch |
| Office kiosk | `/kiosk`, paired with an HR code | Camera face scan (look, then turn your head slightly) or typed ID; outcomes `CHECKED_IN`, `CHECKED_OUT`, `TOO_SOON`, `NOT_RECOGNISED`, `AMBIGUOUS`, `PAST_OPEN` |
| HR | Register, Fix a time, Corrections | Rewrites times and approves; a missed day creates a MANUAL session |

Rules worth knowing:

- **Soft verification.** A failed check sets `approval_status = PENDING` for HR. Only `device_binding_mode = HARD` refuses (HTTP 403 `DEVICE_NOT_AUTHORIZED`).
- **Only APPROVED, closed sessions are paid.** Overtime is the day total beyond the standard hours (HR console, Pay settings; default 8).
- **Missed check-out.** An open session on a past day is unpaid. The hourly job flags it `No check-out`; HR cannot approve it until a check-out time is set.
- **Geo.** Distance to the nearest active fence, minus GPS accuracy (capped at 250 m), must be within radius plus 20 m. No fences configured means location is not checked.
- **Phone binding.** One approved phone per employee. The first is auto-approved; later ones wait for HR. Re-pairing the app revokes the old phone and its token. Nonces are single-use, 2 minutes, and stored in the database, so more than one backend instance is fine.
- **Payroll.** `HOURLY` = hours x rate. `MONTHLY` = base / (standard hours x scheduled days) x hours, capped at base. Overtime pays at the multiplier in Pay settings. Scheduled days are the month's days minus the weekly off days; holidays stay in that count because they are paid back as credit. One run per month. The **Adjust** action adds or subtracts from net after deductions.
- **Holidays and leave** (HR console: Holidays, Leave; employees: Leave tab). A *paid holiday* on a normal working day credits everyone one standard day of pay, whether or not they came in; anyone who works it is also paid for those hours. An *unpaid holiday* is a day off with no pay. Leave types (seeded: casual, sick, earned, unpaid) are paid or unpaid with an optional yearly limit (0 = none). A request counts working days only (weekly offs and holidays inside the range are skipped), may be a half day, cannot overlap another request, cannot exceed the type's remaining days (counted against the year it starts in), and waits for HR; HR can also record leave for someone, approved at once. Approved *paid* leave credits a standard day per leave day in payroll; *unpaid* leave credits nothing and is shown on the payslip. Leave is not checked against attendance: someone who clocks in on a leave day is paid for both.
- **Pay settings** (HR console): standard hours per day, weekly off days, overtime multiplier and default pay mode, saved in the database. Changes apply to new punches and new payroll runs; days already totalled keep their numbers.
- **Deductions** are rules HR turns on under Pay settings: a percent of gross (optionally on wages up to a cap) or a fixed amount, optionally only when gross is at least / at most some amount. Three examples ship switched off (provident fund 12% on the first 15,000, a 0.75% scheme up to 21,000 gross, a 200 flat tax from 15,000 gross): rates and limits differ by country, state and year, so check them before switching one on. A deduction never takes more than was earned.

## Clocking in by face, sign-in, and office WiFi

- **Face alone clocks you in and out, with no sign-in.** The landing page (`/punch`, also the Android app's start screen) shows the camera; look at it, turn your head slightly, and the server works out who you are from the face (`POST /api/public/face-punch`) and toggles in/out. HR creates the employee and the employee enrols their own face once (Portal, My face, after signing in), or HR enrols it. A face can only be changed by HR, so nobody can swap in someone else.
- **Low light and accuracy.** The camera is asked for continuous exposure; dark frames are brightened before detection (`frontend/src/lib/enhance.ts`) and well-lit frames are untouched, so speed is the same in normal light. A punch averages the descriptors of up to five frontal, confident frames rather than trusting one. In a dark room the whole screen turns white as a fill light. Enrolment takes 8 varied shots. After every clean, confident punch the server may remember a new look (other light, angle) as an extra template, up to 14 per person, replacing only the oldest learned one; flagged or weak punches never teach it. Turn that off with `APP_FACE_LEARN=0`. HR re-enrolling replaces all templates. If recognition is still weak, the next step is a stronger model (ArcFace or MobileFaceNet), which needs a model download and re-enrolment of everyone.
- **Because nothing proves which phone it is, the other checks do the work:** location (geo-fence) and the office network (public IP, plus the access point BSSID in the Android app). A failed check, a weak face match, or no location **flags the punch for HR**; it is never blocked. Unrecognised faces are limited to 20 per 5 minutes per IP.
- **If the face will not match.** After three unrecognised scans in a row the Face punch screen offers a request: the employee types their employee ID and phone number, takes a photo with the phone camera, chooses clocking in or out, and sends it. Nothing is clocked yet. HR sees the photo, the time and the location/WiFi result under **Photo requests**, and Approve clocks them in or out at the time they asked (Reject discards it). Wrong ID/phone attempts lock that ID for 15 minutes; at most 3 requests can wait per employee; photos must be JPEG under 300 KB and are deleted 30 days after HR decides.
- **Sign-in is only for the timesheet, corrections and payslips.** Employees use employee ID + phone number + password (all three must match; the error never says which was wrong; phones are compared by their last 10 digits and are unique). HR and admin can also use email + password. Five failed attempts lock that ID for 15 minutes (in memory, per backend instance).
- **Registering a phone** (My phone tab) is auto-approved only for the first phone and only from the office network, otherwise HR approves. Pairing (optional pair-once code) needs the office network. Neither needs a face.
- **WiFi check.** Browsers cannot read the WiFi name, so the check compares the request's public IP with the office networks HR lists (HR console, WiFi tab: open it on the office WiFi and press "Use my current network"). With no active networks nothing is checked. Behind a reverse proxy set `APP_TRUST_PROXY=true`. A guest on the same WiFi, or a rooted phone faking its BSSID, can still pass, so keep HR review of flagged punches.
- Kiosk employees (`OFFICE_DEVICE`) can still use the shared kiosk.

## Android app

Build (JDK 17, Android SDK; uses the Gradle wrapper, Gradle 9.3.1 and AGP 9.1):

```bash
cd android-app
JAVA_HOME="C:/Program Files/Java/jdk-17" ./gradlew assembleDebug -PappUrl=http://localhost:5173
```

APK: `android-app/app/build/outputs/apk/debug/app-debug.apk`. The `appUrl` is baked in at build time.

**Test on a USB-connected phone** (USB debugging on). With `adb reverse` the phone's own `localhost:5173` reaches this PC, which also counts as a secure context so camera and location work, with no HTTPS tunnel needed:

```bash
adb devices
adb reverse tcp:5173 tcp:5173
adb install -r android-app/app/build/outputs/apk/debug/app-debug.apk
```

Open **Attendance** on the phone. Keep the backend (8080) and frontend (5173) running. The app starts on the face punch screen. Signing in (employee ID, phone number and password) is only needed for the timesheet and payslips; pairing with a code is optional, at `/app/pair`.

- Local testing: the phone's requests reach the backend through the Vite proxy, so the server sees `127.0.0.1`. If you added office WiFi networks, add `127.0.0.1/32` and `::1/128` too, or leave WiFi unconfigured while testing. BSSID matching works with the phone's real WiFi.
- Plain HTTP is allowed only for `localhost`/`127.0.0.1` (see `network_security_config.xml`). For real use deploy the web app over HTTPS and build with `-PappUrl=https://your-domain`.
- The Android emulator needs about 4 GB free RAM and 12 GB disk for its default image; on a smaller machine use a real phone.

## Not built yet

- **Fingerprint matching** (SourceAFIS and SecuGen). The kiosk supports face and typed ID.
- **Face accuracy is untested on real people.** Enrol in HR (Employees, Enrol face: 5 shots), then tune `app.attendance.face-confident / face-weak / face-margin` from real kiosk results. Liveness is a client-side head turn, a deterrent only. The camera needs HTTPS or localhost.
- **Slab-based income tax (TDS)**, leave carry-forward, per-employee deduction overrides, and admin notifications (long-open and missed-checkout alerts are logged only).
- **Selfie storage**, map picker for locations, and WebAuthn passkeys (the Keystore/IndexedDB device key replaces them).
- **Production hardening:** rate limiting on login and pairing, password reset, HTTPS termination, backups. See the earlier plan.
- The Android app compiles and produces an APK, but has not been run on a device or emulator yet.
