package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.VerificationService.PunchInput;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;

/**
 * When the face will not match, the employee identifies themselves (employee ID + phone), takes a photo and asks for approval.
 * Nothing is clocked until HR looks at the photo and approves; the time recorded is when the request was made.
 */
@Service
public class FaceRequestService {
    static final int MAX_PHOTO_BYTES = 300_000;
    static final int MAX_PENDING_PER_EMPLOYEE = 3;
    static final int KEEP_DECIDED_DAYS = 30;

    private final JdbcClient db;
    private final EmployeeService employees;
    private final VerificationService verification;
    private final TimeService time;

    public FaceRequestService(JdbcClient db, EmployeeService employees, VerificationService verification, TimeService time) {
        this.db = db;
        this.employees = employees;
        this.verification = verification;
        this.time = time;
    }

    private record Req(long id, long employeeId, String action, LocalDateTime requestedAt, Double latitude, Double longitude,
                       Double accuracyMeters, String status) {}

    /** Wrong ID/phone is reported as 401 so the caller can count it against the lockout. */
    @Transactional
    public long submit(String employeeCode, String phone, String action, String photoDataUrl, PunchInput ctx) {
        if (!"IN".equals(action) && !"OUT".equals(action)) throw ApiException.bad("action must be IN or OUT");
        M.Emp emp = employees.byCode(employeeCode);
        if (emp == null || !emp.active() || !EmployeeService.samePhone(emp.phone(), phone)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_DETAILS", "Wrong employee ID or phone number");
        }
        byte[] photo = decodePhoto(photoDataUrl);
        int pending = db.sql("SELECT COUNT(*) FROM face_requests WHERE employee_id = ? AND status = 'PENDING'").param(emp.id()).query(Integer.class).single();
        if (pending >= MAX_PENDING_PER_EMPLOYEE) {
            throw ApiException.conflict("You already have " + pending + " requests waiting for HR. Please wait for them to be approved.");
        }
        // Same location and WiFi checks as a normal punch, recorded as context for HR (the face is the part that failed).
        var ev = verification.evaluateFacePunch(emp, ctx, 0, false);
        String context = ev.reason() == null ? "Location and WiFi look fine" : ev.reason();
        var kh = new GeneratedKeyHolder();
        db.sql("""
                INSERT INTO face_requests (employee_id, action, requested_at, photo, latitude, longitude, accuracy_meters, client_ip, bssid, context)
                VALUES (?,?,?,?,?,?,?,?,?,?)""")
                .param(emp.id()).param(action).param(time.now()).param(photo).param(ctx.lat()).param(ctx.lng()).param(ctx.accuracy())
                .param(ctx.clientIp()).param(ctx.bssid()).param(context).update(kh, "id");
        return kh.getKey().longValue();
    }

    static byte[] decodePhoto(String dataUrl) {
        if (dataUrl == null || dataUrl.isBlank()) throw ApiException.bad("A photo is required");
        String b64 = dataUrl.contains(",") ? dataUrl.substring(dataUrl.indexOf(',') + 1) : dataUrl;
        byte[] bytes;
        try {
            bytes = Base64.getMimeDecoder().decode(b64.trim());
        } catch (IllegalArgumentException e) {
            throw ApiException.bad("The photo could not be read");
        }
        if (bytes.length > MAX_PHOTO_BYTES) throw ApiException.bad("The photo is too large");
        boolean jpeg = bytes.length > 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF;
        if (!jpeg) throw ApiException.bad("The photo must be a JPEG");
        return bytes;
    }

    public List<M.FaceRequestView> pending() {
        return db.sql("""
                SELECT r.id, r.employee_id, e.name AS employee_name, e.employee_code, r.action, r.requested_at, r.context, r.latitude, r.longitude
                FROM face_requests r JOIN employees e ON e.id = r.employee_id
                WHERE r.status = 'PENDING' ORDER BY r.requested_at""").query(M.FaceRequestView.class).list();
    }

    public byte[] photo(long id) {
        return db.sql("SELECT photo FROM face_requests WHERE id = ?").param(id).query(byte[].class).optional()
                .orElseThrow(() -> ApiException.notFound("Request"));
    }

    private Req load(long id) {
        return db.sql("SELECT id, employee_id, action, requested_at, latitude, longitude, accuracy_meters, status FROM face_requests WHERE id = ?")
                .param(id).query(Req.class).optional().orElseThrow(() -> ApiException.notFound("Request"));
    }

    /** Applies the clock-in or clock-out at the time the employee asked. */
    @Transactional
    public void approve(long id, long hrId) {
        Req r = load(id);
        if (!"PENDING".equals(r.status())) throw ApiException.conflict("Already decided");
        M.Session open = time.openSession(r.employeeId());
        LocalDateTime at = r.requestedAt();
        if ("IN".equals(r.action())) {
            if (open != null) throw ApiException.conflict("They are already clocked in. Reject this request, or fix the existing session.");
            db.sql("""
                    INSERT INTO attendance_sessions (employee_id, work_date, clock_in, source, verification_method, verified, flagged,
                      latitude, longitude, accuracy_meters, approval_status, approved_by, approved_at)
                    VALUES (?,?,?,'FACE_REQUEST','HR_PHOTO',TRUE,FALSE,?,?,?,'APPROVED',?,?)""")
                    .param(r.employeeId()).param(at.toLocalDate()).param(at).param(r.latitude()).param(r.longitude()).param(r.accuracyMeters())
                    .param(hrId).param(time.now()).update();
            time.recompute(r.employeeId(), at.toLocalDate());
        } else {
            if (open == null) throw ApiException.conflict("They are not clocked in, so there is nothing to clock out.");
            if (!at.isAfter(open.clockIn())) throw ApiException.conflict("The request is earlier than the clock-in. Use Fix a time.");
            if (Duration.between(open.clockIn(), at).toHours() > 24) throw ApiException.conflict("That session is over 24 hours long. Use Fix a time.");
            int extraBreak = open.breakStarted() != null ? (int) Math.max(0, Duration.between(open.breakStarted(), at).toMinutes()) : 0;
            db.sql("UPDATE attendance_sessions SET clock_out = ?, break_started = NULL, break_minutes = break_minutes + ? WHERE id = ?")
                    .param(at).param(extraBreak).param(open.id()).update();
            time.recompute(open.employeeId(), open.workDate());
        }
        db.sql("UPDATE face_requests SET status = 'APPROVED', decided_by = ?, decided_at = ? WHERE id = ?").param(hrId).param(time.now()).param(id).update();
    }

    @Transactional
    public void reject(long id, long hrId) {
        Req r = load(id);
        if (!"PENDING".equals(r.status())) throw ApiException.conflict("Already decided");
        db.sql("UPDATE face_requests SET status = 'REJECTED', decided_by = ?, decided_at = ? WHERE id = ?").param(hrId).param(time.now()).param(id).update();
    }

    /** Photos are personal data: decided requests are deleted after 30 days. */
    @Transactional
    public int purgeOld() {
        return db.sql("DELETE FROM face_requests WHERE status <> 'PENDING' AND decided_at < ?")
                .param(time.now().minusDays(KEEP_DECIDED_DAYS)).update();
    }
}
