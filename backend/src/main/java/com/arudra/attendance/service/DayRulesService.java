package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.PolicyService.Policy;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Turns a month of attendance into one status per day (loss of pay, lateness) and into an honour score.
 * The rules are plain functions of the policy, so they can be tested without a database.
 */
@Service
public class DayRulesService {
    public record AttDay(int workedMinutes, LocalTime checkIn) {}
    public record LeaveDay(boolean paid, boolean half) {}

    /** status: OFF, HOLIDAY, HOLIDAY_UNPAID, LEAVE, UNPAID_LEAVE, FULL, HALF, SHORT, ABSENT. */
    public record Day(LocalDate date, String status, int workedMinutes, int lateMinutes, int shortMinutes, double lop, boolean overridden) {}

    public record Month(List<Day> days, double lopDays, double dayLop, double lateLop, int lateDays, int full, int half, int shortDays, int absent,
                        int unpaidLeave, int required, int punched) {}

    public record Score(Integer score, String level, double attendancePct, double punctualityPct, double hoursPct, double disciplinePct,
                        int requiredDays, int fullDays, int halfDays, int lateDays, int flaggedPunches, int corrections) {}

    private final JdbcClient db;
    private final PolicyService policies;
    private final SettingsService settings;
    private final CalendarService calendar;
    private final OffDayService offDays;

    public DayRulesService(JdbcClient db, PolicyService policies, SettingsService settings, CalendarService calendar, OffDayService offDays) {
        this.offDays = offDays;
        this.db = db;
        this.policies = policies;
        this.settings = settings;
        this.calendar = calendar;
    }

    // ---------------- pure rules ----------------

    public static Month evaluate(LocalDate from, LocalDate to, int standardMinutes, Policy p, Set<DayOfWeek> off, Map<LocalDate, M.Holiday> holidays,
                                 Map<LocalDate, LeaveDay> leave, Map<LocalDate, AttDay> att, Map<LocalDate, BigDecimal> overrides) {
        return evaluate(from, to, standardMinutes, p, d -> off, holidays, leave, att, overrides);
    }

    /** offFor gives the employee's weekly off days on a date, since their off day can change during the month. */
    public static Month evaluate(LocalDate from, LocalDate to, int standardMinutes, Policy p, java.util.function.Function<LocalDate, Set<DayOfWeek>> offFor,
                                 Map<LocalDate, M.Holiday> holidays, Map<LocalDate, LeaveDay> leave, Map<LocalDate, AttDay> att, Map<LocalDate, BigDecimal> overrides) {
        List<Day> days = new ArrayList<>();
        double dayLop = 0;
        int lateDays = 0, full = 0, half = 0, shortDays = 0, absent = 0, unpaidLeave = 0, required = 0, punched = 0;
        int fullNeeded = Math.max(1, standardMinutes - p.graceMinutes());
        LocalTime lateAfter = p.shiftStart().plusMinutes(p.lateGraceMinutes());
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            AttDay a = att.get(d);
            int worked = a == null ? 0 : a.workedMinutes();
            String status;
            double lop;
            int late = 0, shortMin = 0;
            M.Holiday h = holidays.get(d);
            LeaveDay lv = leave.get(d);
            if (offFor.apply(d).contains(d.getDayOfWeek())) { status = "OFF"; lop = 0; }
            else if (h != null) { status = h.paid() ? "HOLIDAY" : "HOLIDAY_UNPAID"; lop = h.paid() ? 0 : 1; }
            else if (lv != null) {
                if (lv.paid()) { status = "LEAVE"; lop = 0; }
                else { status = "UNPAID_LEAVE"; lop = lv.half() ? 0.5 : 1; unpaidLeave++; required++; }
            } else {
                required++;
                if (a != null && worked > 0) {
                    punched++;
                    shortMin = Math.max(0, standardMinutes - worked);
                    if (a.checkIn() != null && a.checkIn().isAfter(lateAfter)) late = (int) java.time.Duration.between(p.shiftStart(), a.checkIn()).toMinutes();
                    if (worked >= fullNeeded) { status = "FULL"; lop = 0; full++; }
                    else if (worked >= p.halfDayMinMinutes()) { status = "HALF"; lop = 0.5; half++; }
                    else { status = "SHORT"; lop = 1; shortDays++; }
                    if (late > 0) lateDays++;
                } else { status = "ABSENT"; lop = 1; absent++; }
            }
            boolean over = false;
            BigDecimal o = overrides.get(d);
            if (o != null) { lop = o.doubleValue(); over = true; }
            dayLop += lop;
            days.add(new Day(d, status, worked, late, shortMin, lop, over));
        }
        double lateLop = p.lateCountForHalfDay() > 0 ? (lateDays / p.lateCountForHalfDay()) * 0.5 : 0;
        return new Month(days, dayLop + lateLop, dayLop, lateLop, lateDays, full, half, shortDays, absent, unpaidLeave, required, punched);
    }

    public static Score score(Month m, Policy p, int flagged, int corrections) {
        if (m.required() == 0 && m.punched() == 0) return new Score(null, "NO_DATA", 0, 0, 0, 0, 0, 0, 0, 0, flagged, corrections);
        double attendance = m.required() == 0 ? 100 : 100.0 * (m.full() + 0.5 * m.half()) / m.required();
        double punctuality = m.punched() == 0 ? 100 : 100.0 * (m.punched() - m.lateDays()) / m.punched();
        double hours = m.punched() == 0 ? 100 : 100.0 * m.full() / m.punched();
        double discipline = Math.max(0, 100 - 10.0 * (flagged + corrections));
        int w = p.wAttendance() + p.wPunctuality() + p.wHours() + p.wDiscipline();
        double total = (attendance * p.wAttendance() + punctuality * p.wPunctuality() + hours * p.wHours() + discipline * p.wDiscipline()) / w;
        int s = (int) Math.round(Math.max(0, Math.min(100, total)));
        String level = s >= 90 ? "GOLD" : s >= 75 ? "SILVER" : s >= 60 ? "BRONZE" : "IMPROVE";
        return new Score(s, level, round1(attendance), round1(punctuality), round1(hours), round1(discipline), m.required(), m.full(), m.half(), m.lateDays(), flagged, corrections);
    }

    private static double round1(double v) { return Math.round(v * 10) / 10.0; }

    // ---------------- with data ----------------

    public Month month(long employeeId, YearMonth ym) {
        LocalDate first = ym.atDay(1), last = ym.atEndOfMonth();
        LocalDate yesterday = LocalDate.now().minusDays(1);
        LocalDate to = last.isAfter(yesterday) ? yesterday : last;
        Timestamp created = db.sql("SELECT created_at FROM employees WHERE id = ?").param(employeeId).query(Timestamp.class).optional().orElse(null);
        LocalDate from = created != null && created.toLocalDateTime().toLocalDate().isAfter(first) ? created.toLocalDateTime().toLocalDate() : first;
        // Attendance entered for earlier days (HR back-filled a new employee) counts too, so start at the earliest punch.
        java.sql.Date earliest = db.sql("SELECT MIN(work_date) FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                .param(employeeId).param(first).param(to).query(java.sql.Date.class).optional().orElse(null);
        if (earliest != null && earliest.toLocalDate().isBefore(from)) from = earliest.toLocalDate();
        Policy p = policies.get();
        if (from.isAfter(to)) return evaluate(from, from.minusDays(1), 0, p, Set.of(), Map.of(), Map.of(), Map.of(), Map.of());

        record AttRow(LocalDate workDate, int workedMinutes, LocalDateTime checkIn) {}
        Map<LocalDate, AttDay> att = new HashMap<>();
        for (AttRow r : db.sql("SELECT work_date, worked_minutes, check_in FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                .param(employeeId).param(from).param(to).query(AttRow.class).list())
            att.put(r.workDate(), new AttDay(r.workedMinutes(), r.checkIn() == null ? null : r.checkIn().toLocalTime()));

        record Req(LocalDate startDate, LocalDate endDate, boolean halfDay, boolean paid) {}
        Map<LocalDate, M.Holiday> holidays = calendar.holidaysBetween(from, to);
        var off = offDays.resolver(employeeId);
        Map<LocalDate, LeaveDay> leave = new HashMap<>();
        for (Req r : db.sql("""
                SELECT r.start_date, r.end_date, r.half_day, t.paid FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
                WHERE r.employee_id = ? AND r.status = 'APPROVED' AND r.start_date <= ? AND r.end_date >= ?""")
                .param(employeeId).param(to).param(from).query(Req.class).list()) {
            LocalDate a = r.startDate().isBefore(from) ? from : r.startDate();
            LocalDate b = r.endDate().isAfter(to) ? to : r.endDate();
            for (LocalDate d = a; !d.isAfter(b); d = d.plusDays(1)) if (!off.apply(d).contains(d.getDayOfWeek()) && !holidays.containsKey(d)) leave.put(d, new LeaveDay(r.paid(), r.halfDay()));
        }

        record Ov(LocalDate workDate, BigDecimal lopDays) {}
        Map<LocalDate, BigDecimal> overrides = new HashMap<>();
        for (Ov o : db.sql("SELECT work_date, lop_days FROM lop_overrides WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                .param(employeeId).param(from).param(to).query(Ov.class).list()) overrides.put(o.workDate(), o.lopDays());

        return evaluate(from, to, settings.get().standardDailyHours() * 60, p, off, holidays, leave, att, overrides);
    }

    public Score score(long employeeId, YearMonth ym) {
        Month m = month(employeeId, ym);
        LocalDate first = ym.atDay(1), last = ym.atEndOfMonth();
        int flagged = db.sql("SELECT COUNT(*) FROM attendance_sessions WHERE employee_id = ? AND flagged = TRUE AND work_date BETWEEN ? AND ?")
                .param(employeeId).param(first).param(last).query(Integer.class).single();
        int corr = db.sql("SELECT COUNT(*) FROM attendance_correction_requests WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                .param(employeeId).param(first).param(last).query(Integer.class).single();
        return score(m, policies.get(), flagged, corr);
    }

    public void setOverride(long employeeId, LocalDate date, BigDecimal lopDays, String reason, long byId) {
        if (date == null) throw ApiException.bad("date is required");
        db.sql("DELETE FROM lop_overrides WHERE employee_id = ? AND work_date = ?").param(employeeId).param(date).update();
        if (lopDays == null) return; // clears the override
        if (lopDays.signum() < 0 || lopDays.compareTo(BigDecimal.ONE) > 0) throw ApiException.bad("Loss of pay for a day must be between 0 and 1");
        if (reason == null || reason.isBlank()) throw ApiException.bad("A reason is required");
        db.sql("INSERT INTO lop_overrides (employee_id, work_date, lop_days, reason, set_by) VALUES (?,?,?,?,?)")
                .param(employeeId).param(date).param(lopDays).param(reason.trim()).param(byId).update();
    }

    public Map<LocalDate, String> overrideReasons(long employeeId, YearMonth ym) {
        record R(LocalDate workDate, String reason) {}
        Map<LocalDate, String> out = new HashMap<>();
        for (R r : db.sql("SELECT work_date, reason FROM lop_overrides WHERE employee_id = ? AND work_date BETWEEN ? AND ?")
                .param(employeeId).param(ym.atDay(1)).param(ym.atEndOfMonth()).query(R.class).list()) out.put(r.workDate(), r.reason());
        return out;
    }
}
