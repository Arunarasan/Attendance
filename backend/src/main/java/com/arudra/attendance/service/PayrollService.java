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
import java.util.ArrayList;
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
    private final PolicyService policies;
    private final DayRulesService days;

    public PayrollService(JdbcClient db, SettingsService settings, CalendarService calendar, LeaveService leave, DeductionService deductions,
                          PolicyService policies, DayRulesService days) {
        this.policies = policies;
        this.days = days;
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

    /** One employee's pay for a month, before it is saved as a payslip. */
    public record Line(long employeeId, String employeeName, String mode, BigDecimal regularHours, BigDecimal overtimeHours, BigDecimal gross,
                       BigDecimal deductions, String deductionDetail, BigDecimal net, double paidLeaveDays, double unpaidLeaveDays, int holidayDays,
                       BigDecimal creditHours, BigDecimal lopDays, BigDecimal lopAmount, BigDecimal allowances, BigDecimal bonus, Integer score, boolean lopApplied,
                       String shortfallMethod, BigDecimal requiredHours, BigDecimal shortfallHours, BigDecimal shortfallAmount, BigDecimal extraHours, BigDecimal extraAmount) {}

    /** Working days used as the monthly divisor, by the company's chosen basis. */
    public static int workingDays(String basis, YearMonth ym, int scheduledDays) {
        return switch (basis == null ? "SCHEDULED" : basis) {
            case "CALENDAR" -> ym.lengthOfMonth();
            case "FIXED_26" -> 26;
            case "FIXED_30" -> 30;
            default -> scheduledDays;
        };
    }

    /** Overtime that counts for pay on one day: only what is beyond the threshold, and no more than the daily cap (0 = no cap). */
    public static int effectiveOvertime(int overtimeMinutes, int afterMinutes, int capMinutes) {
        int ot = Math.max(0, overtimeMinutes - Math.max(0, afterMinutes));
        return capMinutes > 0 ? Math.min(ot, capMinutes) : ot;
    }

    /** Monthly pay when loss-of-pay rules are on: base minus a day's pay per loss-of-pay day, plus overtime. Allowances shrink the same way. */
    public static Calc calculateMonthlyLop(BigDecimal baseSalary, BigDecimal allowances, double lopDays, int workingDays, int overtimeMinutes,
                                           int standardDailyHours, BigDecimal overtimeMultiplier, boolean otEligible) {
        int wd = Math.max(1, workingDays);
        BigDecimal dayPay = baseSalary.divide(BigDecimal.valueOf(wd), 6, RoundingMode.HALF_UP);
        BigDecimal lopCut = dayPay.multiply(BigDecimal.valueOf(Math.min(lopDays, wd)));
        BigDecimal regular = baseSalary.subtract(lopCut).max(BigDecimal.ZERO);
        BigDecimal rate = baseSalary.divide(BigDecimal.valueOf((long) standardDailyHours * wd), 6, RoundingMode.HALF_UP);
        BigDecimal otPay = otEligible ? rate.multiply(hours(overtimeMinutes)).multiply(overtimeMultiplier) : BigDecimal.ZERO;
        double keep = Math.max(0, (wd - Math.min(lopDays, wd)) / wd);
        BigDecimal al = allowances.multiply(BigDecimal.valueOf(keep));
        return new Calc(BigDecimal.ZERO, hours(overtimeMinutes), regular.add(otPay).add(al).setScale(2, RoundingMode.HALF_UP));
    }

    /** Monthly pay by hours. */
    public record HoursCalc(BigDecimal requiredHours, BigDecimal countedHours, BigDecimal shortfallHours, BigDecimal shortfallAmount,
                            BigDecimal extraHours, BigDecimal extraAmount, BigDecimal salaryPaid, BigDecimal gross) {}

    /**
     * Monthly salary paid by hours. The salary covers (working days - free off days) x standard hours, so the hourly rate is
     * salary / those hours. Fewer hours than that (worked plus paid leave and paid holidays) cost the missing hours at the rate;
     * more hours earn extra pay at the rate x the overtime multiplier (only for overtime-eligible people). Allowances are paid in full.
     */
    public static HoursCalc calculateMonthlyHours(BigDecimal baseSalary, BigDecimal allowances, int workingDays, int freeOffDays, int standardDailyHours,
                                                  int workedMinutes, int creditMinutes, BigDecimal overtimeMultiplier, boolean otEligible) {
        int requiredDays = Math.max(1, workingDays - Math.max(0, freeOffDays));
        int requiredMin = requiredDays * standardDailyHours * 60;
        BigDecimal rate = baseSalary.divide(BigDecimal.valueOf(requiredMin), 8, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(60));
        int counted = workedMinutes + creditMinutes;
        int diff = counted - requiredMin;
        BigDecimal shortHours = BigDecimal.ZERO, shortAmt = BigDecimal.ZERO, extraHours = BigDecimal.ZERO, extraAmt = BigDecimal.ZERO;
        if (diff < 0) {
            shortHours = hours(-diff);
            shortAmt = rate.multiply(BigDecimal.valueOf(-diff)).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP).min(baseSalary);
        } else if (diff > 0 && otEligible) {
            extraHours = hours(diff);
            extraAmt = rate.multiply(BigDecimal.valueOf(diff)).divide(BigDecimal.valueOf(60), 8, RoundingMode.HALF_UP).multiply(overtimeMultiplier).setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal salaryPaid = baseSalary.subtract(shortAmt);
        BigDecimal gross = salaryPaid.add(extraAmt).add(allowances).setScale(2, RoundingMode.HALF_UP);
        return new HoursCalc(hours(requiredMin), hours(counted), shortHours, shortAmt, extraHours, extraAmt, salaryPaid, gross);
    }

    /** What loss of pay cost in money: the base and allowances that were not paid. */
    public static BigDecimal lopAmount(BigDecimal baseSalary, BigDecimal allowances, double lopDays, int workingDays) {
        int wd = Math.max(1, workingDays);
        BigDecimal frac = BigDecimal.valueOf(Math.min(lopDays, wd)).divide(BigDecimal.valueOf(wd), 6, RoundingMode.HALF_UP);
        return baseSalary.add(allowances).multiply(frac).setScale(2, RoundingMode.HALF_UP);
    }

    /** The first day of [ym] this person is expected to work: their joining day if they joined during that month, else day 1. */
    private int firstExpectedDay(long employeeId, YearMonth ym) {
        LocalDate joined = db.sql("SELECT CAST(created_at AS DATE) FROM employees WHERE id = ?").param(employeeId).query(LocalDate.class).optional().orElse(null);
        return joined != null && YearMonth.from(joined).equals(ym) ? joined.getDayOfMonth() : 1;
    }

    /** Works out every active employee's pay for the month without saving anything. */
    public List<Line> preview(String period, String mode) {
        return preview(period, mode, null);
    }

    /** As {@link #preview(String, String)}, optionally for one employee only. */
    public List<Line> preview(String period, String mode, Long onlyEmployee) {
        if (mode == null) mode = settings.get().defaultMode();
        if (!"HOURLY".equals(mode) && !"MONTHLY".equals(mode)) throw ApiException.bad("mode must be HOURLY or MONTHLY");
        YearMonth ym;
        try { ym = YearMonth.parse(period); } catch (Exception e) { throw ApiException.bad("period must look like 2026-10"); }
        LocalDate from = ym.atDay(1), to = ym.atEndOfMonth();
        SettingsService.Settings st = settings.get();
        PolicyService.Policy pol = policies.get();
        List<M.DeductionRule> rules = deductions.rules();
        List<Line> out = new ArrayList<>();

        List<M.Emp> emps = db.sql("SELECT id, employee_code, name, email, phone, password_hash, role, active, hourly_rate, base_salary, attendance_method, device_binding_mode FROM employees WHERE active = TRUE ORDER BY name")
                .query(M.Emp.class).list();
        record Att(int workedMinutes, int overtimeMinutes) {}
        for (M.Emp e : emps) {
            if (onlyEmployee != null && e.id() != onlyEmployee) continue;
            PolicyService.EmpPay ep = policies.empPay(e.id());
            // each employee's own weekly off decides their working days and which holidays fall on a working day
            int firstDay = firstExpectedDay(e.id(), ym);
            int wd = workingDays(pol.workingDaysBasis(), ym, calendar.scheduledDaysIn(e.id(), ym, firstDay));
            int holidayDays = calendar.paidHolidayWorkdays(e.id(), from, to);
            String empMode = ep.payMode() != null ? ep.payMode() : mode;
            int worked = 0, ot = 0;
            for (Att a : db.sql("SELECT worked_minutes, overtime_minutes FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                    .param(e.id()).param(from).param(to).query(Att.class).list()) {
                worked += a.workedMinutes();
                ot += ep.otEligible() ? effectiveOvertime(a.overtimeMinutes(), pol.otAfterMinutes(), pol.otDailyCapMinutes()) : 0;
            }
            LeaveService.Days leaveDays = leave.leaveDays(e.id(), from, to);
            double paidDays = leaveDays.paid() + holidayDays;
            int creditMinutes = (int) Math.round(paidDays * st.standardDailyHours() * 60);

            DayRulesService.Month dm = days.month(e.id(), ym);
            boolean byHours = "HOURS".equals(pol.shortfallMethod()) && "MONTHLY".equals(empMode);
            boolean lopApplied = !byHours && pol.lopEnabled() && "MONTHLY".equals(empMode);
            Calc c;
            BigDecimal lopAmt = BigDecimal.ZERO;
            HoursCalc hc = null;
            if (byHours) {
                hc = calculateMonthlyHours(e.baseSalary(), ep.allowances(), wd, pol.freeOffDays(), st.standardDailyHours(), worked, creditMinutes, st.overtimeMultiplier(), ep.otEligible());
                c = new Calc(hours(worked), hc.extraHours(), hc.gross());
            } else if (lopApplied) {
                c = calculateMonthlyLop(e.baseSalary(), ep.allowances(), dm.lopDays(), wd, ot, st.standardDailyHours(), st.overtimeMultiplier(), ep.otEligible());
                c = new Calc(hours(Math.max(0, worked - ot)), c.overtimeHours(), c.gross());
                lopAmt = lopAmount(e.baseSalary(), ep.allowances(), dm.lopDays(), wd);
            } else {
                c = calculate(empMode, worked - ot + creditMinutes, ot, e.hourlyRate(), e.baseSalary(), wd, st.standardDailyHours(), st.overtimeMultiplier());
                c = new Calc(c.regularHours(), c.overtimeHours(), c.gross().add(ep.allowances()).setScale(2, RoundingMode.HALF_UP));
            }
            DayRulesService.Score sc = days.score(e.id(), ym);
            BigDecimal bonus = pol.bonusMinScore() > 0 && sc.score() != null && sc.score() >= pol.bonusMinScore() ? pol.bonusAmount() : BigDecimal.ZERO;
            BigDecimal gross = c.gross().add(bonus).setScale(2, RoundingMode.HALF_UP);
            DeductionService.Applied ded = DeductionService.apply(rules, gross);
            out.add(new Line(e.id(), e.name(), empMode, c.regularHours(), c.overtimeHours(), gross, ded.total(), ded.detail().isEmpty() ? null : ded.detail(),
                    gross.subtract(ded.total()), leaveDays.paid(), leaveDays.unpaid(), holidayDays, hours(creditMinutes),
                    BigDecimal.valueOf(lopApplied ? dm.lopDays() : 0).setScale(1, RoundingMode.HALF_UP), lopAmt, ep.allowances(), bonus, sc.score(), lopApplied,
                    byHours ? "HOURS" : null, hc == null ? BigDecimal.ZERO : hc.requiredHours(), hc == null ? BigDecimal.ZERO : hc.shortfallHours(),
                    hc == null ? BigDecimal.ZERO : hc.shortfallAmount(), hc == null ? BigDecimal.ZERO : hc.extraHours(), hc == null ? BigDecimal.ZERO : hc.extraAmount()));
        }
        return out;
    }

    @Transactional
    public long generate(String period, String mode, long hrId) {
        if (mode == null) mode = settings.get().defaultMode();
        List<Line> lines = preview(period, mode);
        Integer exists = db.sql("SELECT COUNT(*) FROM payroll_runs WHERE period = ?").param(period).query(Integer.class).single();
        if (exists > 0) throw ApiException.conflict("Payroll for " + period + " was already generated");
        var kh = new GeneratedKeyHolder();
        db.sql("INSERT INTO payroll_runs (period, mode, created_by) VALUES (?,?,?)").param(period).param(mode).param(hrId).update(kh, "id");
        long runId = kh.getKey().longValue();
        for (Line l : lines) {
            db.sql("""
                    INSERT INTO payslips (run_id, employee_id, period, regular_hours, overtime_hours, gross, adjustments, net,
                      paid_leave_days, unpaid_leave_days, holiday_days, credit_hours, deductions, deduction_detail,
                      lop_days, lop_amount, allowances, bonus, pay_mode, score,
                      shortfall_method, required_hours, shortfall_hours, shortfall_amount, extra_hours, extra_amount)
                    VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""")
                    .param(runId).param(l.employeeId()).param(period).param(l.regularHours()).param(l.overtimeHours()).param(l.gross()).param(l.net())
                    .param(BigDecimal.valueOf(l.paidLeaveDays())).param(BigDecimal.valueOf(l.unpaidLeaveDays())).param(BigDecimal.valueOf(l.holidayDays()))
                    .param(l.creditHours()).param(l.deductions()).param(l.deductionDetail())
                    .param(l.lopDays()).param(l.lopAmount()).param(l.allowances()).param(l.bonus()).param(l.mode()).param(l.score())
                    .param(l.shortfallMethod()).param(l.requiredHours()).param(l.shortfallHours()).param(l.shortfallAmount()).param(l.extraHours()).param(l.extraAmount()).update();
        }
        return runId;
    }

    public List<M.Run> runs() {
        return db.sql("SELECT id, period, mode, created_at FROM payroll_runs ORDER BY id DESC").query(M.Run.class).list();
    }

    private static final String SLIP_COLS = "p.id, p.run_id, p.employee_id, p.period, p.regular_hours, p.overtime_hours, p.gross, p.adjustments, p.net, "
            + "p.paid_leave_days, p.unpaid_leave_days, p.holiday_days, p.credit_hours, p.deductions, p.deduction_detail, "
            + "p.lop_days, p.lop_amount, p.allowances, p.bonus, p.pay_mode, p.score, "
            + "p.shortfall_method, p.required_hours, p.shortfall_hours, p.shortfall_amount, p.extra_hours, p.extra_amount";

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
