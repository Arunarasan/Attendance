package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.Set;

/** Pay policy HR can edit (working-days basis, overtime thresholds, loss-of-pay rules, honour-score weights) and per-employee pay settings. */
@Service
public class PolicyService {
    public record Policy(String workingDaysBasis, int otAfterMinutes, int otDailyCapMinutes, boolean lopEnabled, int graceMinutes,
                         int halfDayMinMinutes, LocalTime shiftStart, int lateGraceMinutes, int lateCountForHalfDay,
                         int wAttendance, int wPunctuality, int wHours, int wDiscipline, int bonusMinScore, BigDecimal bonusAmount,
                         String shortfallMethod, int freeOffDays) {}

    public record EmpPay(long employeeId, String payMode, BigDecimal allowances, boolean otEligible) {}

    private static final Set<String> BASES = Set.of("SCHEDULED", "CALENDAR", "FIXED_26", "FIXED_30");
    private static final String COLS = "working_days_basis, ot_after_minutes, ot_daily_cap_minutes, lop_enabled, grace_minutes, half_day_min_minutes, shift_start, "
            + "late_grace_minutes, late_count_for_half_day, w_attendance, w_punctuality, w_hours, w_discipline, bonus_min_score, bonus_amount, shortfall_method, free_off_days";

    private final JdbcClient db;

    public PolicyService(JdbcClient db) {
        this.db = db;
    }

    public Policy get() {
        return db.sql("SELECT " + COLS + " FROM pay_policy WHERE id = 1").query(Policy.class).single();
    }

    public Policy update(Policy p) {
        if (p.workingDaysBasis() == null || !BASES.contains(p.workingDaysBasis())) throw ApiException.bad("Working-days basis must be SCHEDULED, CALENDAR, FIXED_26 or FIXED_30");
        range(p.otAfterMinutes(), 0, 600, "Overtime starts after");
        range(p.otDailyCapMinutes(), 0, 1440, "Daily overtime cap");
        range(p.graceMinutes(), 0, 120, "Grace minutes");
        range(p.halfDayMinMinutes(), 30, 720, "Half-day minimum minutes");
        range(p.lateGraceMinutes(), 0, 120, "Late grace minutes");
        range(p.lateCountForHalfDay(), 0, 31, "Lates that make a half day");
        for (int w : new int[]{p.wAttendance(), p.wPunctuality(), p.wHours(), p.wDiscipline()}) range(w, 0, 100, "Score weight");
        if (p.wAttendance() + p.wPunctuality() + p.wHours() + p.wDiscipline() <= 0) throw ApiException.bad("At least one score weight must be above 0");
        range(p.bonusMinScore(), 0, 100, "Bonus minimum score");
        if (p.bonusAmount() == null || p.bonusAmount().signum() < 0) throw ApiException.bad("Bonus amount cannot be negative");
        if (!"DAYS".equals(p.shortfallMethod()) && !"HOURS".equals(p.shortfallMethod())) throw ApiException.bad("Shortfall method must be DAYS or HOURS");
        range(p.freeOffDays(), 0, 10, "Free off days");
        if (p.shiftStart() == null) throw ApiException.bad("Shift start time is required");
        db.sql("""
                UPDATE pay_policy SET working_days_basis=?, ot_after_minutes=?, ot_daily_cap_minutes=?, lop_enabled=?, grace_minutes=?, half_day_min_minutes=?,
                  shift_start=?, late_grace_minutes=?, late_count_for_half_day=?, w_attendance=?, w_punctuality=?, w_hours=?, w_discipline=?,
                  bonus_min_score=?, bonus_amount=?, shortfall_method=?, free_off_days=? WHERE id = 1""")
                .param(p.workingDaysBasis()).param(p.otAfterMinutes()).param(p.otDailyCapMinutes()).param(p.lopEnabled()).param(p.graceMinutes())
                .param(p.halfDayMinMinutes()).param(p.shiftStart()).param(p.lateGraceMinutes()).param(p.lateCountForHalfDay())
                .param(p.wAttendance()).param(p.wPunctuality()).param(p.wHours()).param(p.wDiscipline()).param(p.bonusMinScore()).param(p.bonusAmount()).param(p.shortfallMethod()).param(p.freeOffDays()).update();
        return get();
    }

    private static void range(int v, int lo, int hi, String what) {
        if (v < lo || v > hi) throw ApiException.bad(what + " must be between " + lo + " and " + hi);
    }

    // ---- per employee ----

    public EmpPay empPay(long employeeId) {
        return db.sql("SELECT employee_id, pay_mode, allowances, ot_eligible FROM employee_pay WHERE employee_id = ?").param(employeeId)
                .query(EmpPay.class).optional().orElse(new EmpPay(employeeId, null, BigDecimal.ZERO, true));
    }

    public EmpPay setEmpPay(long employeeId, String payMode, BigDecimal allowances, Boolean otEligible) {
        Integer exists = db.sql("SELECT COUNT(*) FROM employees WHERE id = ?").param(employeeId).query(Integer.class).single();
        if (exists == 0) throw ApiException.notFound("Employee");
        String mode = payMode == null || payMode.isBlank() ? null : payMode;
        if (mode != null && !"HOURLY".equals(mode) && !"MONTHLY".equals(mode)) throw ApiException.bad("Pay mode must be HOURLY, MONTHLY or empty (company default)");
        BigDecimal al = allowances == null ? BigDecimal.ZERO : allowances;
        if (al.signum() < 0) throw ApiException.bad("Allowances cannot be negative");
        boolean ot = otEligible == null || otEligible;
        db.sql("DELETE FROM employee_pay WHERE employee_id = ?").param(employeeId).update();
        db.sql("INSERT INTO employee_pay (employee_id, pay_mode, allowances, ot_eligible) VALUES (?,?,?,?)").param(employeeId).param(mode).param(al).param(ot).update();
        return empPay(employeeId);
    }
}
