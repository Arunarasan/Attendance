package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Leave types, requests, balances and the leave days that feed payroll.
 * Days are working days only: weekly off days and holidays inside a range are not counted.
 * A request's days count against the calendar year it starts in.
 */
@Service
public class LeaveService {
    private static final String REQ_SELECT = """
            SELECT r.id, r.employee_id, e.name AS employee_name, e.employee_code, r.leave_type_id, t.code AS leave_code,
                   t.name AS leave_name, t.paid, r.start_date, r.end_date, r.half_day, r.days, r.reason, r.status, r.created_at
            FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id""";

    private final JdbcClient db;
    private final CalendarService calendar;
    private final TimeService time;

    public LeaveService(JdbcClient db, CalendarService calendar, TimeService time) {
        this.db = db;
        this.calendar = calendar;
        this.time = time;
    }

    // ---------- types ----------

    public List<M.LeaveType> types(boolean onlyActive) {
        return db.sql("SELECT id, code, name, paid, annual_quota, active FROM leave_types" + (onlyActive ? " WHERE active = TRUE" : "") + " ORDER BY id")
                .query(M.LeaveType.class).list();
    }

    public M.LeaveType type(long id) {
        return db.sql("SELECT id, code, name, paid, annual_quota, active FROM leave_types WHERE id = ?").param(id)
                .query(M.LeaveType.class).optional().orElseThrow(() -> ApiException.notFound("Leave type"));
    }

    public void addType(String code, String name, Boolean paid, BigDecimal quota) {
        if (code == null || code.isBlank() || code.length() > 12) throw ApiException.bad("Code is required (up to 12 characters)");
        if (name == null || name.isBlank()) throw ApiException.bad("Name is required");
        if (quota != null && quota.signum() < 0) throw ApiException.bad("Quota cannot be negative");
        try {
            db.sql("INSERT INTO leave_types (code, name, paid, annual_quota) VALUES (?,?,?,?)")
                    .param(code.trim().toUpperCase()).param(name.trim()).param(paid == null || paid).param(quota == null ? BigDecimal.ZERO : quota).update();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("A leave type with code " + code.trim().toUpperCase() + " already exists");
        }
    }

    public void updateType(long id, String name, Boolean paid, BigDecimal quota, Boolean active) {
        if (quota != null && quota.signum() < 0) throw ApiException.bad("Quota cannot be negative");
        int n = db.sql("UPDATE leave_types SET name = COALESCE(?, name), paid = COALESCE(?, paid), annual_quota = COALESCE(?, annual_quota), active = COALESCE(?, active) WHERE id = ?")
                .param(name).param(paid).param(quota).param(active).param(id).update();
        if (n == 0) throw ApiException.notFound("Leave type");
    }

    // ---------- balances ----------

    public List<M.LeaveBalance> balances(long employeeId, int year) {
        LocalDate from = LocalDate.of(year, 1, 1), to = LocalDate.of(year, 12, 31);
        List<M.LeaveBalance> out = new ArrayList<>();
        for (M.LeaveType t : types(true)) {
            BigDecimal used = sum(employeeId, t.id(), "APPROVED", from, to);
            BigDecimal pending = sum(employeeId, t.id(), "PENDING", from, to);
            BigDecimal remaining = t.annualQuota().signum() > 0 ? t.annualQuota().subtract(used).subtract(pending) : null;
            out.add(new M.LeaveBalance(t.id(), t.code(), t.name(), t.paid(), t.annualQuota(), used, pending, remaining));
        }
        return out;
    }

    private BigDecimal sum(long employeeId, long typeId, String status, LocalDate from, LocalDate to) {
        BigDecimal v = db.sql("SELECT COALESCE(SUM(days), 0) FROM leave_requests WHERE employee_id = ? AND leave_type_id = ? AND status = ? AND start_date BETWEEN ? AND ?")
                .param(employeeId).param(typeId).param(status).param(from).param(to).query(BigDecimal.class).single();
        return v;
    }

    // ---------- requests ----------

    @Transactional
    public long request(long employeeId, long typeId, LocalDate start, LocalDate end, boolean halfDay, String reason, Long approvedBy) {
        M.LeaveType t = type(typeId);
        if (!t.active()) throw ApiException.bad("That leave type is not available");
        if (start == null || end == null || end.isBefore(start)) throw ApiException.bad("The end date must not be before the start date");
        if (halfDay && !start.equals(end)) throw ApiException.bad("A half day must be a single date");
        if (start.isBefore(time.now().toLocalDate().minusDays(60))) throw ApiException.bad("Leave more than 60 days in the past cannot be requested");
        if (java.time.temporal.ChronoUnit.DAYS.between(start, end) > 90) throw ApiException.bad("A single request can cover at most 90 days");
        double days = calendar.workdaysBetween(start, end, halfDay);
        if (days <= 0) throw ApiException.bad("That range has no working days (weekly offs and holidays are not counted)");
        BigDecimal d = BigDecimal.valueOf(days);

        Integer overlap = db.sql("SELECT COUNT(*) FROM leave_requests WHERE employee_id = ? AND status IN ('PENDING','APPROVED') AND start_date <= ? AND end_date >= ?")
                .param(employeeId).param(end).param(start).query(Integer.class).single();
        if (overlap > 0) throw ApiException.conflict("That overlaps another leave request");

        if (t.annualQuota().signum() > 0) {
            BigDecimal used = sum(employeeId, typeId, "APPROVED", LocalDate.of(start.getYear(), 1, 1), LocalDate.of(start.getYear(), 12, 31))
                    .add(sum(employeeId, typeId, "PENDING", LocalDate.of(start.getYear(), 1, 1), LocalDate.of(start.getYear(), 12, 31)));
            BigDecimal left = t.annualQuota().subtract(used);
            if (d.compareTo(left) > 0) {
                throw ApiException.bad("Only " + left.stripTrailingZeros().toPlainString() + " day(s) of " + t.name().toLowerCase() + " left for " + start.getYear());
            }
        }
        var kh = new GeneratedKeyHolder();
        boolean approve = approvedBy != null;
        db.sql("""
                INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, half_day, days, reason, status, decided_by, decided_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)""")
                .param(employeeId).param(typeId).param(start).param(end).param(halfDay).param(d).param(reason == null ? null : reason.trim())
                .param(approve ? "APPROVED" : "PENDING").param(approvedBy).param(approve ? time.now() : null).update(kh, "id");
        return kh.getKey().longValue();
    }

    public List<M.LeaveRequestView> mine(long employeeId) {
        return db.sql(REQ_SELECT + " WHERE r.employee_id = ? ORDER BY r.start_date DESC").param(employeeId).query(M.LeaveRequestView.class).list();
    }

    public List<M.LeaveRequestView> byStatus(String status) {
        return db.sql(REQ_SELECT + " WHERE r.status = ? ORDER BY r.start_date").param(status).query(M.LeaveRequestView.class).list();
    }

    private record Row(long id, long employeeId, String status) {}

    private Row row(long id) {
        return db.sql("SELECT id, employee_id, status FROM leave_requests WHERE id = ?").param(id).query(Row.class).optional()
                .orElseThrow(() -> ApiException.notFound("Leave request"));
    }

    @Transactional
    public void decide(long id, boolean approve, long hrId) {
        Row r = row(id);
        if (!"PENDING".equals(r.status())) throw ApiException.conflict("Already " + r.status().toLowerCase());
        db.sql("UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?")
                .param(approve ? "APPROVED" : "REJECTED").param(hrId).param(time.now()).param(id).update();
    }

    /** An employee withdraws their own request while it is still waiting. */
    @Transactional
    public void cancel(long id, long employeeId) {
        Row r = row(id);
        if (r.employeeId() != employeeId) throw ApiException.notFound("Leave request");
        if (!"PENDING".equals(r.status())) throw ApiException.conflict("Only a request that is still waiting can be withdrawn. Ask HR.");
        db.sql("UPDATE leave_requests SET status = 'CANCELLED', decided_at = ? WHERE id = ?").param(time.now()).param(id).update();
    }

    // ---------- for payroll ----------

    public record Days(double paid, double unpaid) {}

    /** Approved leave days inside [from, to], split into paid and unpaid, counting only working days in that window. */
    public Days leaveDays(long employeeId, LocalDate from, LocalDate to) {
        double paid = 0, unpaid = 0;
        Map<LocalDate, M.Holiday> holidays = calendar.holidaysBetween(from, to);
        record Req(LocalDate startDate, LocalDate endDate, boolean halfDay, boolean paid) {}
        List<Req> reqs = db.sql("""
                SELECT r.start_date, r.end_date, r.half_day, t.paid FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
                WHERE r.employee_id = ? AND r.status = 'APPROVED' AND r.start_date <= ? AND r.end_date >= ?""")
                .param(employeeId).param(to).param(from).query(Req.class).list();
        for (Req r : reqs) {
            LocalDate a = r.startDate().isBefore(from) ? from : r.startDate();
            LocalDate b = r.endDate().isAfter(to) ? to : r.endDate();
            double n = 0;
            for (LocalDate d = a; !d.isAfter(b); d = d.plusDays(1)) if (calendar.isWorkday(d, holidays)) n++;
            if (r.halfDay()) n *= 0.5;
            if (r.paid()) paid += n; else unpaid += n;
        }
        return new Days(paid, unpaid);
    }
}
