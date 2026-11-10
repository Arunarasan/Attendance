package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.config.AppProps;
import com.arudra.attendance.config.Crypto;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.VerificationService.Eval;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

/** Shared office kiosk: pairing, face 1:N match, manual fallback. Verification is soft; weak matches go to HR. */
@Service
public class KioskService {
    public record PunchResult(String outcome, String employeeName, Double faceDistance, boolean flagged, String message) {}

    private final JdbcClient db;
    private final TimeService time;
    private final FaceService faces;
    private final VerificationService verification;
    private final AppProps.Attendance cfg;

    public KioskService(JdbcClient db, TimeService time, FaceService faces, VerificationService verification, AppProps props) {
        this.db = db;
        this.time = time;
        this.faces = faces;
        this.verification = verification;
        this.cfg = props.attendance();
    }

    // ---------- admin ----------

    @Transactional
    public Map<String, Object> create(String name, String verifyMode) {
        var kh = new GeneratedKeyHolder();
        db.sql("INSERT INTO attendance_kiosks (name, verify_mode) VALUES (?,?)").param(name)
                .param(verifyMode == null ? "EITHER" : verifyMode).update(kh, "id");
        long id = kh.getKey().longValue();
        return Map.of("id", id, "code", newPairCode(id));
    }

    @Transactional
    public String newPairCode(long kioskId) {
        String code = Crypto.randomCode();
        int n = db.sql("UPDATE attendance_kiosks SET code_hash = ?, code_expires_at = ? WHERE id = ? AND active = TRUE")
                .param(Crypto.sha256(code)).param(LocalDateTime.now().plusHours(24)).param(kioskId).update();
        if (n == 0) throw ApiException.notFound("Kiosk");
        return code;
    }

    public List<M.Kiosk> list() {
        return db.sql("SELECT id, name, verify_mode, active, (token_hash IS NOT NULL) AS paired FROM attendance_kiosks ORDER BY id")
                .query(M.Kiosk.class).list();
    }

    public void deactivate(long id) {
        db.sql("UPDATE attendance_kiosks SET active = FALSE, token_hash = NULL, code_hash = NULL WHERE id = ?").param(id).update();
    }

    public void enrolFace(long employeeId, List<double[]> descriptors) {
        faces.enrol(employeeId, descriptors);
    }

    // ---------- kiosk device ----------

    /** Trades the single-use code for a token. Only the hash is stored; re-pairing replaces (revokes) the old token. */
    @Transactional
    public String pair(String code) {
        String hash = Crypto.sha256(code == null ? "" : code.trim().toUpperCase());
        Long id = db.sql("SELECT id FROM attendance_kiosks WHERE code_hash = ? AND code_expires_at >= ? AND active = TRUE")
                .param(hash).param(LocalDateTime.now()).query(Long.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "BAD_CODE", "Invalid or expired code"));
        String token = Crypto.randomToken();
        db.sql("UPDATE attendance_kiosks SET token_hash = ?, code_hash = NULL, code_expires_at = NULL WHERE id = ?")
                .param(Crypto.sha256(token)).param(id).update();
        return token;
    }

    public long authenticate(String token) {
        if (token == null || token.isBlank()) throw new ApiException(HttpStatus.UNAUTHORIZED, "KIOSK_AUTH", "Kiosk token required");
        return db.sql("SELECT id FROM attendance_kiosks WHERE token_hash = ? AND active = TRUE").param(Crypto.sha256(token))
                .query(Long.class).optional().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "KIOSK_AUTH", "Kiosk not paired"));
    }

    // ---------- punches ----------

    /** Who is this face? Either a confident-enough single match, or a failure result to show the person. */
    private record Who(Long employeeId, Double distance, boolean weak, PunchResult failure) {}

    private Who identify(double[] descriptor) {
        if (!FaceService.valid(descriptor)) throw ApiException.bad("Face descriptor must have 128 numbers");
        List<Map.Entry<Long, Double>> ranked = new ArrayList<>(faces.bestPerEmployee(descriptor).entrySet());
        ranked.sort(Map.Entry.comparingByValue());
        if (ranked.isEmpty() || ranked.get(0).getValue() > cfg.faceWeak()) {
            return new Who(null, null, false, new PunchResult("NOT_RECOGNISED", null, null, false, "Face not recognised"));
        }
        double d0 = ranked.get(0).getValue();
        if (ranked.size() > 1 && ranked.get(1).getValue() - d0 < cfg.faceMargin()) {
            return new Who(null, d0, false, new PunchResult("AMBIGUOUS", null, d0, false, "Could not tell who this is; try again"));
        }
        return new Who(ranked.get(0).getKey(), d0, d0 > cfg.faceConfident(), null);
    }

    public PunchResult punchFace(String token, double[] descriptor) {
        long kioskId = authenticate(token);
        Who w = identify(descriptor);
        if (w.failure() != null) return w.failure();
        PunchResult r = toggle(w.employeeId(), kioskId, "KIOSK", w.distance(), w.weak(), w.weak() ? "Weak face match" : null);
        learnFrom(r, w, descriptor);
        return r;
    }

    /**
     * Face-only punch from any phone, with no sign-in: the face says who it is. Because nothing proves which device this is,
     * location and the office network are checked and a failure (or a weak match) flags the punch for HR.
     */
    public PunchResult punchFaceOpen(double[] descriptor, VerificationService.PunchInput ctx) {
        Who w = identify(descriptor);
        if (w.failure() != null) return w.failure();
        M.Emp emp = time.employee(w.employeeId());
        if (!emp.active()) return new PunchResult("NOT_RECOGNISED", null, null, false, "Face not recognised");
        Eval ev = verification.evaluateFacePunch(emp, ctx, w.distance(), w.weak());
        PunchResult r = toggle(emp.id(), null, "FACE", ev);
        learnFrom(r, w, descriptor);
        return r;
    }

    /** Only clean punches teach the system: recognised confidently, nothing flagged (so not a location/WiFi doubt). */
    private void learnFrom(PunchResult r, Who w, double[] descriptor) {
        boolean done = "CHECKED_IN".equals(r.outcome()) || "CHECKED_OUT".equals(r.outcome());
        if (done && !r.flagged() && !w.weak() && w.employeeId() != null) faces.learn(w.employeeId(), descriptor);
    }

    /** Fallback: typed employee code or phone. Auto-approved only if a supplied face also matches that employee. */
    public PunchResult punchManual(String token, String identifier, double[] descriptor) {
        long kioskId = authenticate(token);
        String id = identifier == null ? "" : identifier.trim();
        Long empId = db.sql("SELECT id FROM employees WHERE active = TRUE AND (LOWER(employee_code) = LOWER(?) OR phone = ?)")
                .param(id).param(EmployeeService.digits(id)).query(Long.class).optional().orElse(null);
        if (empId == null) return new PunchResult("NOT_RECOGNISED", null, null, false, "No employee with that ID");
        Double dist = FaceService.valid(descriptor) ? faces.distanceTo(empId, descriptor) : null;
        boolean matched = dist != null && dist <= cfg.faceWeak();
        return toggle(empId, kioskId, "KIOSK_MANUAL", dist, !matched, matched ? null : "Manual punch without face match");
    }

    PunchResult toggle(long employeeId, Long kioskId, String source, Double faceDistance, boolean flagged, String reason) {
        return toggle(employeeId, kioskId, source, new Eval(flagged, reason, source, null, null, null, null, null, null, faceDistance));
    }

    @Transactional
    PunchResult toggle(long employeeId, Long kioskId, String source, Eval ev) {
        M.Emp emp = time.employee(employeeId);
        M.Session open = time.openSession(employeeId);
        LocalDateTime now = time.now();
        Double faceDistance = ev.faceDistance();
        boolean flagged = ev.flagged();
        if (open != null) {
            if (open.workDate().isBefore(now.toLocalDate())) {
                return new PunchResult("PAST_OPEN", emp.name(), faceDistance, false, "Yesterday's session is still open. Ask HR.");
            }
            if (Duration.between(open.clockIn(), now).getSeconds() < cfg.kioskMinGapSeconds()) {
                return new PunchResult("TOO_SOON", emp.name(), faceDistance, false, "Already punched a moment ago");
            }
            time.endSession(open, ev);
            return new PunchResult("CHECKED_OUT", emp.name(), faceDistance, flagged, "Goodbye, " + emp.name());
        }
        time.startSession(employeeId, ev, source, kioskId, faceDistance, null);
        return new PunchResult("CHECKED_IN", emp.name(), faceDistance, flagged, "Welcome, " + emp.name());
    }
}
