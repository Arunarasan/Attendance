package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class CorrectionService {
    private final JdbcClient db;
    private final TimeService time;

    public CorrectionService(JdbcClient db, TimeService time) {
        this.db = db;
        this.time = time;
    }

    @Transactional
    public void request(long employeeId, LocalDate date, LocalDateTime in, LocalDateTime out, String reason) {
        if (in == null || out == null || !out.isAfter(in)) throw ApiException.bad("Check-out must be after check-in");
        if (reason == null || reason.isBlank()) throw ApiException.bad("Reason is required");
        if (date.isAfter(time.now().toLocalDate())) throw ApiException.bad("Cannot correct a future date");
        List<M.Session> existing = time.sessionsFor(employeeId, date, date);
        M.Session first = existing.stream().filter(s -> !"REJECTED".equals(s.approvalStatus())).findFirst().orElse(null);
        db.sql("""
                INSERT INTO attendance_correction_requests (employee_id, work_date, original_in, original_out, requested_in, requested_out, reason)
                VALUES (?,?,?,?,?,?,?)""")
                .param(employeeId).param(date).param(first == null ? null : first.clockIn()).param(first == null ? null : first.clockOut())
                .param(in).param(out).param(reason.trim()).update();
    }

    public List<M.Correction> mine(long employeeId) {
        return db.sql("SELECT id, employee_id, work_date, original_in, original_out, requested_in, requested_out, reason, status FROM attendance_correction_requests WHERE employee_id = ? ORDER BY id DESC")
                .param(employeeId).query(M.Correction.class).list();
    }

    public List<M.CorrectionView> pending() {
        return db.sql("""
                SELECT c.id, c.employee_id, e.name AS employee_name, c.work_date, c.original_in, c.original_out,
                       c.requested_in, c.requested_out, c.reason, c.status
                FROM attendance_correction_requests c JOIN employees e ON e.id = c.employee_id
                WHERE c.status = 'PENDING' ORDER BY c.id""").query(M.CorrectionView.class).list();
    }

    @Transactional
    public void approve(long id, long hrId) {
        M.Correction c = load(id);
        if (!"PENDING".equals(c.status())) throw ApiException.conflict("Already decided");
        time.applyForDate(c.employeeId(), c.workDate(), c.requestedIn(), c.requestedOut(), hrId);
        db.sql("UPDATE attendance_correction_requests SET status = 'APPROVED', decided_by = ?, decided_at = ? WHERE id = ?")
                .param(hrId).param(time.now()).param(id).update();
    }

    @Transactional
    public void reject(long id, long hrId) {
        M.Correction c = load(id);
        if (!"PENDING".equals(c.status())) throw ApiException.conflict("Already decided");
        db.sql("UPDATE attendance_correction_requests SET status = 'REJECTED', decided_by = ?, decided_at = ? WHERE id = ?")
                .param(hrId).param(time.now()).param(id).update();
    }

    private M.Correction load(long id) {
        return db.sql("SELECT id, employee_id, work_date, original_in, original_out, requested_in, requested_out, reason, status FROM attendance_correction_requests WHERE id = ?")
                .param(id).query(M.Correction.class).optional().orElseThrow(() -> ApiException.notFound("Correction"));
    }
}
