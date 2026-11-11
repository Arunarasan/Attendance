package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Holidays and what counts as a working day (not a weekly off day, not a holiday). */
@Service
public class CalendarService {
    private final JdbcClient db;
    private final SettingsService settings;
    private final OffDayService offDays;

    public CalendarService(JdbcClient db, SettingsService settings, OffDayService offDays) {
        this.db = db;
        this.settings = settings;
        this.offDays = offDays;
    }

    // ---------- holidays ----------

    public List<M.Holiday> holidays(int year) {
        return db.sql("SELECT id, holiday_date, name, paid FROM holidays WHERE holiday_date BETWEEN ? AND ? ORDER BY holiday_date")
                .param(LocalDate.of(year, 1, 1)).param(LocalDate.of(year, 12, 31)).query(M.Holiday.class).list();
    }

    public Map<LocalDate, M.Holiday> holidaysBetween(LocalDate from, LocalDate to) {
        Map<LocalDate, M.Holiday> out = new HashMap<>();
        for (M.Holiday h : db.sql("SELECT id, holiday_date, name, paid FROM holidays WHERE holiday_date BETWEEN ? AND ?")
                .param(from).param(to).query(M.Holiday.class).list()) out.put(h.holidayDate(), h);
        return out;
    }

    public M.Holiday addHoliday(LocalDate date, String name, Boolean paid) {
        if (date == null) throw ApiException.bad("date is required");
        if (name == null || name.isBlank()) throw ApiException.bad("name is required");
        try {
            db.sql("INSERT INTO holidays (holiday_date, name, paid) VALUES (?,?,?)").param(date).param(name.trim()).param(paid == null || paid).update();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("There is already a holiday on " + date);
        }
        return db.sql("SELECT id, holiday_date, name, paid FROM holidays WHERE holiday_date = ?").param(date).query(M.Holiday.class).single();
    }

    public void updateHoliday(long id, String name, Boolean paid) {
        int n = db.sql("UPDATE holidays SET name = COALESCE(?, name), paid = COALESCE(?, paid) WHERE id = ?").param(name).param(paid).param(id).update();
        if (n == 0) throw ApiException.notFound("Holiday");
    }

    public void deleteHoliday(long id) {
        db.sql("DELETE FROM holidays WHERE id = ?").param(id).update();
    }

    // ---------- working days ----------

    public boolean isWeeklyOff(LocalDate d) {
        return settings.get().offDays().contains(d.getDayOfWeek());
    }

    /** A day people are normally expected to work: not a weekly off day and not a holiday (paid or not). */
    public boolean isWorkday(LocalDate d, Map<LocalDate, M.Holiday> holidays) {
        return !isWeeklyOff(d) && !holidays.containsKey(d);
    }

    /** Working days in [from, to], optionally half a day when from == to. Used to size a leave request. */
    public double workdaysBetween(LocalDate from, LocalDate to, boolean halfDay) {
        Map<LocalDate, M.Holiday> hol = holidaysBetween(from, to);
        int n = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) if (isWorkday(d, hol)) n++;
        return halfDay ? n * 0.5 : n;
    }

    // ---- the same questions for one employee, whose weekly off may differ from the company's ----

    public boolean isWorkday(long employeeId, LocalDate d, Map<LocalDate, M.Holiday> holidays) {
        return !offDays.isOff(employeeId, d) && !holidays.containsKey(d);
    }

    public double workdaysBetween(long employeeId, LocalDate from, LocalDate to, boolean halfDay) {
        Map<LocalDate, M.Holiday> hol = holidaysBetween(from, to);
        var off = offDays.resolver(employeeId);
        int n = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) if (!off.apply(d).contains(d.getDayOfWeek()) && !hol.containsKey(d)) n++;
        return halfDay ? n * 0.5 : n;
    }

    /** The employee's working days in a month before holidays are removed (their weekly offs only): the monthly-pay divisor. */
    public int scheduledDaysIn(long employeeId, YearMonth ym) {
        return scheduledDaysIn(employeeId, ym, 1);
    }

    /** Working days from [firstDay] to the end of the month (a mid-month joiner is only expected from the day they joined). */
    public int scheduledDaysIn(long employeeId, YearMonth ym, int firstDay) {
        var off = offDays.resolver(employeeId);
        int days = 0;
        for (int d = Math.max(1, firstDay); d <= ym.lengthOfMonth(); d++) if (!off.apply(ym.atDay(d)).contains(ym.atDay(d).getDayOfWeek())) days++;
        return days;
    }

    /** Paid holidays that fall on one of the employee's normal working days: each is a day of pay. */
    public int paidHolidayWorkdays(long employeeId, LocalDate from, LocalDate to) {
        var off = offDays.resolver(employeeId);
        int n = 0;
        for (M.Holiday h : holidaysBetween(from, to).values()) if (h.paid() && !off.apply(h.holidayDate()).contains(h.holidayDate().getDayOfWeek())) n++;
        return n;
    }

    /** Scheduled working days in a month before holidays are removed (weekly offs only): the monthly-pay divisor. */
    public int scheduledDaysIn(YearMonth ym) {
        return scheduledDaysIn(ym, settings.get().offDays());
    }

    public static int scheduledDaysIn(YearMonth ym, Set<DayOfWeek> off) {
        int days = 0;
        for (int d = 1; d <= ym.lengthOfMonth(); d++) if (!off.contains(ym.atDay(d).getDayOfWeek())) days++;
        return days;
    }

    /** Paid holidays that fall on a normal working day in [from, to]: each is a day of pay for everyone. */
    public int paidHolidayWorkdays(LocalDate from, LocalDate to) {
        int n = 0;
        for (M.Holiday h : holidaysBetween(from, to).values()) if (h.paid() && !isWeeklyOff(h.holidayDate())) n++;
        return n;
    }
}
