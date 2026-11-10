package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.VerificationService.Eval;
import com.arudra.attendance.service.VerificationService.PunchInput;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Sessions, per-day aggregate, approvals and HR time fixes. */
@Service
public class TimeService {
    private static final String SESSION_COLS = """
            id, employee_id, work_date, clock_in, clock_out, break_started, break_minutes, source, verification_method,
            verified, flagged, flag_reason, distance_meters, device_id, device_verified, kiosk_id, face_distance,
            approval_status, approved_by, approved_at""";

    private final JdbcClient db;
    private final VerificationService verification;
    private final Clock clock;
    private final SettingsService settings;

    public TimeService(JdbcClient db, VerificationService verification, Clock clock, SettingsService settings) {
        this.db = db;
        this.verification = verification;
        this.clock = clock;
        this.settings = settings;
    }

    // ---------- lookups ----------

    public M.Emp employee(long id) {
        return db.sql("SELECT id, employee_code, name, email, phone, password_hash, role, active, hourly_rate, base_salary, attendance_method, device_binding_mode FROM employees WHERE id = ?")
                .param(id).query(M.Emp.class).optional().orElseThrow(() -> ApiException.notFound("Employee"));
    }

    public M.Session session(long id) {
        return db.sql("SELECT " + SESSION_COLS + " FROM attendance_sessions WHERE id = ?").param(id)
                .query(M.Session.class).optional().orElseThrow(() -> ApiException.notFound("Session"));
    }

    public M.Session openSession(long employeeId) {
        return db.sql("SELECT " + SESSION_COLS + " FROM attendance_sessions WHERE employee_id = ? AND clock_out IS NULL AND approval_status <> 'REJECTED' ORDER BY clock_in DESC LIMIT 1")
                .param(employeeId).query(M.Session.class).optional().orElse(null);
    }

    public List<M.Session> sessionsFor(long employeeId, LocalDate from, LocalDate to) {
        return db.sql("SELECT " + SESSION_COLS + " FROM attendance_sessions WHERE employee_id = ? AND work_date BETWEEN ? AND ? ORDER BY clock_in")
                .param(employeeId).param(from).param(to).query(M.Session.class).list();
    }

    public List<M.Day> days(long employeeId, LocalDate from, LocalDate to) {
        return db.sql("SELECT employee_id, work_date, check_in, check_out, break_minutes, worked_minutes, overtime_minutes FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date")
                .param(employeeId).param(from).param(to).query(M.Day.class).list();
    }

    public LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    // ---------- punches ----------

    @Transactional
    public M.Session clockIn(long employeeId, PunchInput in) {
        M.Emp emp = activeEmployee(employeeId);
        requireNoOpen(employeeId);
        Eval ev = verification.evaluate(emp, in);
        return startSession(emp.id(), ev, "PORTAL", null, null, in.deviceId());
    }

    @Transactional
    public M.Session clockOut(long employeeId, PunchInput in) {
        M.Emp emp = activeEmployee(employeeId);
        M.Session open = requireOpen(employeeId);
        Eval ev = verification.evaluate(emp, in);
        return endSession(open, ev);
    }

    @Transactional
    public M.Session startBreak(long employeeId) {
        M.Session s = requireOpen(employeeId);
        if (s.breakStarted() != null) throw ApiException.conflict("Break already started");
        db.sql("UPDATE attendance_sessions SET break_started = ? WHERE id = ?").param(now()).param(s.id()).update();
        return session(s.id());
    }

    @Transactional
    public M.Session endBreak(long employeeId) {
        M.Session s = requireOpen(employeeId);
        if (s.breakStarted() == null) throw ApiException.conflict("No break in progress");
        int mins = (int) Math.max(0, Duration.between(s.breakStarted(), now()).toMinutes());
        db.sql("UPDATE attendance_sessions SET break_started = NULL, break_minutes = break_minutes + ? WHERE id = ?")
                .param(mins).param(s.id()).update();
        return session(s.id());
    }

    /** Shared by portal, app and kiosk paths. */
    @Transactional
    public M.Session startSession(long employeeId, Eval ev, String source, Long kioskId, Double faceDistance, Long deviceId) {
        LocalDateTime t = now();
        if (faceDistance == null) faceDistance = ev.faceDistance();
        String status = ev.flagged() ? "PENDING" : "APPROVED";
        var kh = new GeneratedKeyHolder();
        db.sql("""
                INSERT INTO attendance_sessions (employee_id, work_date, clock_in, source, verification_method, verified, flagged,
                  flag_reason, latitude, longitude, accuracy_meters, distance_meters, office_location_id, device_id, device_verified,
                  kiosk_id, face_distance, approval_status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""")
                .param(employeeId).param(t.toLocalDate()).param(t).param(source).param(ev.method()).param(!ev.flagged())
                .param(ev.flagged()).param(ev.reason()).param(ev.lat()).param(ev.lng()).param(ev.accuracy())
                .param(ev.distance()).param(ev.locationId()).param(deviceId).param(ev.deviceVerified())
                .param(kioskId).param(faceDistance).param(status).update(kh, "id");
        long id = kh.getKey().longValue();
        recompute(employeeId, t.toLocalDate());
        return session(id);
    }

    @Transactional
    public M.Session endSession(M.Session open, Eval ev) {
        LocalDateTime t = now();
        if (open.workDate().isBefore(t.toLocalDate())) {
            throw ApiException.conflict("A previous day's session is still open. Ask HR to set the check-out time.");
        }
        int extraBreak = open.breakStarted() != null ? (int) Math.max(0, Duration.between(open.breakStarted(), t).toMinutes()) : 0;
        boolean flagged = open.flagged() || ev.flagged();
        String reason = join(open.flagReason(), ev.reason());
        db.sql("""
                UPDATE attendance_sessions SET clock_out = ?, break_started = NULL, break_minutes = break_minutes + ?,
                  flagged = ?, verified = ?, flag_reason = ?, approval_status = ? WHERE id = ?""")
                .param(t).param(extraBreak).param(flagged).param(!flagged).param(reason)
                .param(flagged && "APPROVED".equals(open.approvalStatus()) ? "PENDING" : open.approvalStatus())
                .param(open.id()).update();
        recompute(open.employeeId(), open.workDate());
        return session(open.id());
    }

    private static String join(String a, String b) {
        if (a == null) return b;
        if (b == null) return a;
        return a + "; " + b;
    }

    private M.Emp activeEmployee(long id) {
        M.Emp e = employee(id);
        if (!e.active()) throw ApiException.conflict("Employee is inactive");
        return e;
    }

    private void requireNoOpen(long employeeId) {
        if (openSession(employeeId) != null) throw ApiException.conflict("Already clocked in");
    }

    private M.Session requireOpen(long employeeId) {
        M.Session s = openSession(employeeId);
        if (s == null) throw ApiException.conflict("Not clocked in");
        return s;
    }

    // ---------- aggregate ----------

    /** Only APPROVED, closed sessions are payable. Overtime applies to the daily total past the standard hours. */
    @Transactional
    public void recompute(long employeeId, LocalDate date) {
        List<M.Session> all = sessionsFor(employeeId, date, date);
        int total = 0, breaks = 0;
        LocalDateTime first = null, last = null;
        boolean anyOpen = false;
        for (M.Session s : all) {
            if ("REJECTED".equals(s.approvalStatus())) continue;
            breaks += s.breakMinutes();
            if (first == null || s.clockIn().isBefore(first)) first = s.clockIn();
            if (s.clockOut() == null) { anyOpen = true; continue; }
            if (last == null || s.clockOut().isAfter(last)) last = s.clockOut();
            if ("APPROVED".equals(s.approvalStatus())) {
                total += (int) Math.max(0, Duration.between(s.clockIn(), s.clockOut()).toMinutes() - s.breakMinutes());
            }
        }
        int ot = Math.max(0, total - settings.get().standardDailyHours() * 60);
        LocalDateTime checkOut = anyOpen ? null : last;
        int updated = db.sql("UPDATE attendance SET check_in = ?, check_out = ?, break_minutes = ?, worked_minutes = ?, overtime_minutes = ? WHERE employee_id = ? AND work_date = ?")
                .param(first).param(checkOut).param(breaks).param(total).param(ot).param(employeeId).param(date).update();
        if (updated == 0 && first != null) {
            db.sql("INSERT INTO attendance (employee_id, work_date, check_in, check_out, break_minutes, worked_minutes, overtime_minutes) VALUES (?,?,?,?,?,?,?)")
                    .param(employeeId).param(date).param(first).param(checkOut).param(breaks).param(total).param(ot).update();
        }
    }

    // ---------- approvals ----------

    public List<M.PendingSession> pending() {
        return db.sql("""
                SELECT s.id, s.employee_id, e.name AS employee_name, e.employee_code, s.work_date, s.clock_in, s.clock_out,
                       s.source, s.flag_reason, s.distance_meters, s.face_distance
                FROM attendance_sessions s JOIN employees e ON e.id = s.employee_id
                WHERE s.approval_status = 'PENDING' ORDER BY s.clock_in DESC""").query(M.PendingSession.class).list();
    }

    @Transactional
    public void approve(long sessionId, long hrId) {
        M.Session s = session(sessionId);
        if (s.clockOut() == null && s.workDate().isBefore(now().toLocalDate())) {
            throw ApiException.conflict("Open past session: set the check-out time first");
        }
        db.sql("UPDATE attendance_sessions SET approval_status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ?")
                .param(hrId).param(now()).param(sessionId).update();
        recompute(s.employeeId(), s.workDate());
    }

    @Transactional
    public void reject(long sessionId, long hrId) {
        M.Session s = session(sessionId);
        db.sql("UPDATE attendance_sessions SET approval_status = 'REJECTED', approved_by = ?, approved_at = ? WHERE id = ?")
                .param(hrId).param(now()).param(sessionId).update();
        recompute(s.employeeId(), s.workDate());
    }

    // ---------- HR time fixes ----------

    /** Sets in/out on an existing session; the fix approves it. */
    @Transactional
    public M.Session applyToSession(long sessionId, LocalDateTime in, LocalDateTime out, long hrId) {
        validate(in, out);
        M.Session s = session(sessionId);
        db.sql("""
                UPDATE attendance_sessions SET clock_in = ?, clock_out = ?, work_date = ?, break_started = NULL,
                  approval_status = 'APPROVED', approved_by = ?, approved_at = ?, flagged = FALSE, verified = TRUE WHERE id = ?""")
                .param(in).param(out).param(in.toLocalDate()).param(hrId).param(now()).param(sessionId).update();
        recompute(s.employeeId(), s.workDate());
        recompute(s.employeeId(), in.toLocalDate());
        return session(sessionId);
    }

    /** Fixes the first session of the date, or creates a MANUAL verified session for a fully missed day. */
    @Transactional
    public M.Session applyForDate(long employeeId, LocalDate date, LocalDateTime in, LocalDateTime out, long hrId) {
        validate(in, out);
        employee(employeeId);
        List<M.Session> existing = sessionsFor(employeeId, date, date);
        for (M.Session s : existing) {
            if (!"REJECTED".equals(s.approvalStatus())) return applyToSession(s.id(), in, out, hrId);
        }
        var kh = new GeneratedKeyHolder();
        db.sql("""
                INSERT INTO attendance_sessions (employee_id, work_date, clock_in, clock_out, source, verification_method, verified,
                  flagged, approval_status, approved_by, approved_at)
                VALUES (?,?,?,?,'MANUAL','HR',TRUE,FALSE,'APPROVED',?,?)""")
                .param(employeeId).param(in.toLocalDate()).param(in).param(out).param(hrId).param(now()).update(kh, "id");
        recompute(employeeId, in.toLocalDate());
        return session(kh.getKey().longValue());
    }

    private static void validate(LocalDateTime in, LocalDateTime out) {
        if (in == null || out == null || !out.isAfter(in)) throw ApiException.bad("Check-out must be after check-in");
        if (Duration.between(in, out).toHours() > 24) throw ApiException.bad("A session cannot exceed 24 hours");
    }

    // ---------- scheduled checks ----------

    /** Open sessions on past days are not paid: flag them for HR. Returns number flagged. */
    @Transactional
    public int flagMissedCheckouts() {
        LocalDate today = now().toLocalDate();
        LocalDate from = today.minusDays(31);
        List<M.Session> stale = db.sql("SELECT " + SESSION_COLS + " FROM attendance_sessions WHERE clock_out IS NULL AND work_date < ? AND work_date >= ? AND approval_status = 'APPROVED'")
                .param(today).param(from).query(M.Session.class).list();
        for (M.Session s : stale) {
            db.sql("UPDATE attendance_sessions SET approval_status = 'PENDING', flagged = TRUE, verified = FALSE, flag_reason = ? WHERE id = ?")
                    .param(join(s.flagReason(), "No check-out")).param(s.id()).update();
        }
        return stale.size();
    }

    /** Sessions open longer than the threshold; each is reported once. */
    @Transactional
    public List<M.Session> longOpenSessions(int hours) {
        LocalDateTime cutoff = now().minusHours(hours);
        List<M.Session> list = db.sql("SELECT " + SESSION_COLS + " FROM attendance_sessions WHERE clock_out IS NULL AND clock_in < ? AND overtime_alert_sent = FALSE")
                .param(cutoff).query(M.Session.class).list();
        for (M.Session s : list) db.sql("UPDATE attendance_sessions SET overtime_alert_sent = TRUE WHERE id = ?").param(s.id()).update();
        return list;
    }
}
