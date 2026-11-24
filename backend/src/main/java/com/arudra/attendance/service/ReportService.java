package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.function.Function;

/** Monthly attendance register: one row per employee, one cell per day. */
@Service
public class ReportService {
    public record Cell(String date, String status, LocalDateTime checkIn, LocalDateTime checkOut, int workedMinutes, int overtimeMinutes, String note) {}

    public record Line(long id, String name, String code, boolean active, List<Cell> cells, int present, int noCheckout, int leave,
                       int holiday, int weeklyOff, int absent, int workedMinutes, int overtimeMinutes) {}

    public record Report(String month, List<String> days, List<Line> employees) {}

    private final JdbcClient db;
    private final OffDayService offDays;
    private final Clock clock;

    public ReportService(JdbcClient db, OffDayService offDays, Clock clock) {
        this.db = db;
        this.offDays = offDays;
        this.clock = clock;
    }

    /** employeeId null = every active employee. Status: P present, N no check-out, L leave, H holiday, W weekly off, A absent, F future. */
    public Report month(String month, Long employeeId) {
        YearMonth ym;
        try { ym = YearMonth.parse(month); } catch (Exception e) { throw ApiException.bad("month must look like 2026-11"); }
        LocalDate from = ym.atDay(1), to = ym.atEndOfMonth(), today = LocalDate.now(clock);

        record Emp(long id, String name, String employeeCode, boolean active) {}
        List<Emp> emps = employeeId == null
                ? db.sql("SELECT id, name, employee_code, active FROM employees WHERE active = TRUE ORDER BY name").query(Emp.class).list()
                : db.sql("SELECT id, name, employee_code, active FROM employees WHERE id = ?").param(employeeId).query(Emp.class).list();
        if (employeeId != null && emps.isEmpty()) throw ApiException.notFound("Employee not found");

        record Att(long employeeId, LocalDate workDate, LocalDateTime checkIn, LocalDateTime checkOut, int workedMinutes, int overtimeMinutes) {}
        Map<String, Att> att = new HashMap<>();
        for (Att a : db.sql("SELECT employee_id, work_date, check_in, check_out, worked_minutes, overtime_minutes FROM attendance WHERE work_date BETWEEN ? AND ?")
                .param(from).param(to).query(Att.class).list()) att.put(a.employeeId() + "|" + a.workDate(), a);

        record Lv(long employeeId, LocalDate startDate, LocalDate endDate, String code) {}
        Map<Long, List<Lv>> leaves = new HashMap<>();
        for (Lv l : db.sql("SELECT r.employee_id, r.start_date, r.end_date, t.code FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id WHERE r.status = 'APPROVED' AND r.start_date <= ? AND r.end_date >= ?")
                .param(to).param(from).query(Lv.class).list()) leaves.computeIfAbsent(l.employeeId(), k -> new ArrayList<>()).add(l);

        record Hol(LocalDate holidayDate, String name) {}
        Map<LocalDate, String> holidays = new HashMap<>();
        for (Hol h : db.sql("SELECT holiday_date, name FROM holidays WHERE holiday_date BETWEEN ? AND ?").param(from).param(to).query(Hol.class).list())
            holidays.put(h.holidayDate(), h.name());

        List<String> days = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) days.add(d.toString());

        List<Line> out = new ArrayList<>();
        for (Emp e : emps) {
            Function<LocalDate, Set<DayOfWeek>> off = offDays.resolver(e.id());
            List<Cell> cells = new ArrayList<>();
            int p = 0, n = 0, l = 0, h = 0, w = 0, a = 0, worked = 0, ot = 0;
            for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
                final LocalDate d = day;
                Att at = att.get(e.id() + "|" + d);
                String status, note = null;
                if (at != null && at.checkIn() != null) {
                    boolean open = at.checkOut() == null && !d.equals(today);
                    status = open ? "N" : "P";
                    if (open) n++; else p++;
                    worked += at.workedMinutes(); ot += at.overtimeMinutes();
                } else if (d.isAfter(today)) {
                    status = "F";
                } else {
                    Lv lv = leaves.getOrDefault(e.id(), List.of()).stream().filter(x -> !d.isBefore(x.startDate()) && !d.isAfter(x.endDate())).findFirst().orElse(null);
                    if (lv != null) { status = "L"; note = lv.code(); l++; }
                    else if (holidays.containsKey(d)) { status = "H"; note = holidays.get(d); h++; }
                    else if (off.apply(d).contains(d.getDayOfWeek())) { status = "W"; w++; }
                    else { status = "A"; a++; }
                }
                cells.add(new Cell(d.toString(), status, at == null ? null : at.checkIn(), at == null ? null : at.checkOut(),
                        at == null ? 0 : at.workedMinutes(), at == null ? 0 : at.overtimeMinutes(), note));
            }
            out.add(new Line(e.id(), e.name(), e.employeeCode(), e.active(), cells, p, n, l, h, w, a, worked, ot));
        }
        return new Report(ym.toString(), days, out);
    }
}
