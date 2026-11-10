package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * Pay comes from approved attendance hours, plus a day of standard hours for each paid holiday and each paid leave day.
 * HOURLY = hours x rate. MONTHLY = base / (standard hours x scheduled days) x hours, capped at base.
 * Overtime is paid at rate x multiplier in both modes. Active deduction rules are taken from gross.
 * Scheduled days are the month's days minus weekly offs; holidays stay in that count because they are paid back as credit.
 */
@Service
public class PayrollService {
    private final JdbcClient db;
    private final SettingsService settings;
    private final CalendarService calendar;
    private final LeaveService leave;
    private final DeductionService deductions;

    public PayrollService(JdbcClient db, SettingsService settings, CalendarService calendar, LeaveService leave, DeductionService deductions) {
        this.db = db;
        this.settings = settings;
        this.calendar = calendar;
        this.leave = leave;
        this.deductions = deductions;
    }

    public record Calc(BigDecimal regularHours, BigDecimal overtimeHours, BigDecimal gross) {}

    /** The pay maths, free of any lookups so it can be tested on its own. */
    public static Calc calculate(String mode, int regularMinutes, int overtimeMinutes, BigDecimal hourlyRate, BigDecimal baseSalary,
                                 int scheduledDays, int standardDailyHours, BigDecimal overtimeMultiplier) {
        BigDecimal reg = hours(regularMinutes);
        BigDecimal ot = hours(overtimeMinutes);
        BigDecimal rate = hourlyRate;
        BigDecimal regularPay;
        if ("MONTHLY".equals(mode)) {
            BigDecimal denom = BigDecimal.valueOf((long) standardDailyHours * Math.max(1, scheduledDays));
            rate = baseSalary.divide(denom, 6, RoundingMode.HALF_UP);
            regularPay = rate.multiply(reg).min(baseSalary);
        } else {
            regularPay = hourlyRate.multiply(reg);
        }
        BigDecimal otPay = rate.multiply(ot).multiply(overtimeMultiplier);
        return new Calc(reg, ot, regularPay.add(otPay).setScale(2, RoundingMode.HALF_UP));
    }

    private static BigDecimal hours(int minutes) {
        return BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    @Transactional
    public long generate(String period, String mode, long hrId) {
        if (mode == null) mode = settings.get().defaultMode();
        if (!"HOURLY".equals(mode) && !"MONTHLY".equals(mode)) throw ApiException.bad("mode must be HOURLY or MONTHLY");
        YearMonth ym;
        try { ym = YearMonth.parse(period); } catch (Exception e) { throw ApiException.bad("period must look like 2026-10"); }
        Integer exists = db.sql("SELECT COUNT(*) FROM payroll_runs WHERE period = ?").param(period).query(Integer.class).single();
        if (exists > 0) throw ApiException.conflict("Payroll for " + period + " was already generated");
        LocalDate from = ym.atDay(1), to = ym.atEndOfMonth();
        SettingsService.Settings st = settings.get();
        int scheduledDays = CalendarService.scheduledDaysIn(ym, st.offDays());
        int holidayDays = calendar.paidHolidayWorkdays(from, to);
        List<M.DeductionRule> rules = deductions.rules();

        var kh = new GeneratedKeyHolder();
        db.sql("INSERT INTO payroll_runs (period, mode, created_by) VALUES (?,?,?)").param(period).param(mode).param(hrId).update(kh, "id");
        long runId = kh.getKey().longValue();

        List<M.Emp> emps = db.sql("SELECT id, employee_code, name, email, phone, password_hash, role, active, hourly_rate, base_salary, attendance_method, device_binding_mode FROM employees WHERE active = TRUE")
                .query(M.Emp.class).list();
        for (M.Emp e : emps) {
            int worked = db.sql("SELECT COALESCE(SUM(worked_minutes),0) FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                    .param(e.id()).param(from).param(to).query(Integer.class).single();
            int ot = db.sql("SELECT COALESCE(SUM(overtime_minutes),0) FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                    .param(e.id()).param(from).param(to).query(Integer.class).single();
            LeaveService.Days leaveDays = leave.leaveDays(e.id(), from, to);
            double paidDays = leaveDays.paid() + holidayDays;
            int creditMinutes = (int) Math.round(paidDays * st.standardDailyHours() * 60);

            Calc c = calculate(mode, worked - ot + creditMinutes, ot, e.hourlyRate(), e.baseSalary(), scheduledDays,
                    st.standardDailyHours(), st.overtimeMultiplier());
            DeductionService.Applied ded = DeductionService.apply(rules, c.gross());
            BigDecimal net = c.gross().subtract(ded.total());
            db.sql("""
                    INSERT INTO payslips (run_id, employee_id, period, regular_hours, overtime_hours, gross, adjustments, net,
                      paid_leave_days, unpaid_leave_days, holiday_days, credit_hours, deductions, deduction_detail)
                    VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?)""")
                    .param(runId).param(e.id()).param(period).param(c.regularHours()).param(c.overtimeHours()).param(c.gross()).param(net)
                    .param(BigDecimal.valueOf(leaveDays.paid())).param(BigDecimal.valueOf(leaveDays.unpaid())).param(BigDecimal.valueOf(holidayDays))
                    .param(hours(creditMinutes)).param(ded.total()).param(ded.detail().isEmpty() ? null : ded.detail()).update();
        }
        return runId;
    }

    public List<M.Run> runs() {
        return db.sql("SELECT id, period, mode, created_at FROM payroll_runs ORDER BY id DESC").query(M.Run.class).list();
    }

    private static final String SLIP_COLS = "p.id, p.run_id, p.employee_id, p.period, p.regular_hours, p.overtime_hours, p.gross, p.adjustments, p.net, "
            + "p.paid_leave_days, p.unpaid_leave_days, p.holiday_days, p.credit_hours, p.deductions, p.deduction_detail";

    public List<M.PayslipView> payslips(long runId) {
        return db.sql("SELECT " + SLIP_COLS.replace("p.employee_id,", "p.employee_id, e.name AS employee_name,")
                        + " FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.run_id = ? ORDER BY e.name")
                .param(runId).query(M.PayslipView.class).list();
    }

    public List<M.Payslip> mine(long employeeId) {
        return db.sql("SELECT " + SLIP_COLS + " FROM payslips p WHERE p.employee_id = ? ORDER BY p.period DESC")
                .param(employeeId).query(M.Payslip.class).list();
    }

    /** An adjustment is added to (or, if negative, taken from) net after deductions. */
    @Transactional
    public void adjust(long payslipId, BigDecimal amount) {
        int n = db.sql("UPDATE payslips SET adjustments = ?, net = gross - deductions + ? WHERE id = ?").param(amount).param(amount).param(payslipId).update();
        if (n == 0) throw ApiException.notFound("Payslip");
    }
}
