package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/**
 * Weekly off days per employee. The company default (Pay settings) applies unless the employee has a rule.
 * HR can assign a rule; an employee can ask for a change, which only takes effect if HR approves it.
 */
@Service
public class OffDayService {
    public static final int MAX_OFF_DAYS = 2;
    public static final int COOLDOWN_DAYS = 30;
    public static final String DEFAULT = "DEFAULT";

    public record Rule(long id, long employeeId, String offDays, LocalDate validFrom, String source, Long setBy) {}

    public record Request(long id, long employeeId, String employeeName, String employeeCode, String offDays, LocalDate effectiveFrom,
                          String reason, String status, String decisionNote, LocalDateTime createdAt) {}

    public record Current(List<String> days, boolean companyDefault, LocalDate validFrom, String source, List<String> upcomingDays, LocalDate upcomingFrom) {}

    private final JdbcClient db;
    private final SettingsService settings;

    public OffDayService(JdbcClient db, SettingsService settings) {
        this.db = db;
        this.settings = settings;
    }

    // ---------------- pure resolution ----------------

    /** The off days on a date: the newest rule starting on or before it, else the company default. */
    public static Set<DayOfWeek> resolve(List<Rule> rules, LocalDate date, Set<DayOfWeek> company) {
        Rule best = null;
        for (Rule r : rules) {
            if (r.validFrom().isAfter(date)) continue;
            if (best == null || r.validFrom().isAfter(best.validFrom()) || (r.validFrom().equals(best.validFrom()) && r.id() > best.id())) best = r;
        }
        if (best == null || DEFAULT.equals(best.offDays())) return company;
        return SettingsService.parseDays(best.offDays());
    }

    // ---------------- lookups ----------------

    public List<Rule> rules(long employeeId) {
        return List.copyOf(RequestCache.get(java.util.List.of("off_rules", employeeId), () ->
            db.sql("SELECT id, employee_id, off_days, valid_from, source, set_by FROM employee_off_rules WHERE employee_id = ? ORDER BY valid_from, id")
                .param(employeeId).query(Rule.class).list()));
    }

    /** One lookup of the employee's rules, then a cheap answer per date. */
    public Function<LocalDate, Set<DayOfWeek>> resolver(long employeeId) {
        List<Rule> rules = rules(employeeId);
        Set<DayOfWeek> company = settings.get().offDays();
        return d -> resolve(rules, d, company);
    }

    public boolean isOff(long employeeId, LocalDate d) {
        return resolver(employeeId).apply(d).contains(d.getDayOfWeek());
    }

    public Current current(long employeeId) {
        List<Rule> rules = rules(employeeId);
        Set<DayOfWeek> company = settings.get().offDays();
        LocalDate today = LocalDate.now();
        Set<DayOfWeek> now = resolve(rules, today, company);
        Rule active = null, upcoming = null;
        for (Rule r : rules) {
            if (!r.validFrom().isAfter(today)) { if (active == null || !r.validFrom().isBefore(active.validFrom())) active = r; }
            else if (upcoming == null || !r.validFrom().isAfter(upcoming.validFrom())) upcoming = r; // earliest start; on a tie the newer rule wins
        }
        boolean def = active == null || DEFAULT.equals(active.offDays());
        List<String> up = upcoming == null ? null : names(resolve(List.of(upcoming), upcoming.validFrom(), company));
        return new Current(names(now), def, active == null ? null : active.validFrom(), active == null ? "COMPANY" : active.source(), up, upcoming == null ? null : upcoming.validFrom());
    }

    static List<String> names(Set<DayOfWeek> days) {
        List<String> out = new ArrayList<>();
        for (DayOfWeek d : DayOfWeek.values()) if (days.contains(d)) out.add(d.name());
        return out;
    }

    private static Set<DayOfWeek> parse(List<String> days) {
        if (days == null || days.isEmpty()) throw ApiException.bad("Choose at least one weekly off day");
        Set<DayOfWeek> set = EnumSet.noneOf(DayOfWeek.class);
        for (String d : days) set.add(SettingsService.parseDay(d));
        if (set.size() > MAX_OFF_DAYS) throw ApiException.bad("You can choose at most " + MAX_OFF_DAYS + " weekly off days");
        return set;
    }

    private static String csv(Set<DayOfWeek> days) {
        List<String> out = new ArrayList<>();
        for (DayOfWeek d : DayOfWeek.values()) if (days.contains(d)) out.add(SettingsService.abbrev(d));
        return String.join(",", out);
    }

    // ---------------- HR assigns ----------------

    /** days == null puts the employee back on the company default. Takes effect from validFrom (default today); never in the past. */
    @Transactional
    public void assign(long employeeId, List<String> days, LocalDate validFrom, long byId) {
        LocalDate from = validFrom == null ? LocalDate.now() : validFrom;
        if (from.isBefore(LocalDate.now())) throw ApiException.bad("A weekly off change cannot start in the past");
        if (from.isAfter(LocalDate.now().plusDays(90))) throw ApiException.bad("A weekly off change can start at most 90 days ahead");
        Integer n = db.sql("SELECT COUNT(*) FROM employees WHERE id = ?").param(employeeId).query(Integer.class).single();
        if (n == 0) throw ApiException.notFound("Employee");
        String value = days == null ? DEFAULT : csv(parse(days));
        insertRule(employeeId, value, from, "HR", byId);
    }

    private void insertRule(long employeeId, String value, LocalDate from, String source, Long byId) {
        db.sql("INSERT INTO employee_off_rules (employee_id, off_days, valid_from, source, set_by) VALUES (?,?,?,?,?)")
                .param(employeeId).param(value).param(from).param(source).param(byId).update();
    }

    // ---------------- employee requests ----------------

    private static final String REQ_SELECT = "SELECT r.id, r.employee_id, e.name AS employee_name, e.employee_code, r.off_days, r.effective_from, r.reason, r.status, "
            + "r.decision_note, r.created_at FROM off_day_requests r JOIN employees e ON e.id = r.employee_id";

    @Transactional
    public long request(long employeeId, List<String> days, LocalDate effectiveFrom, String reason) {
        Set<DayOfWeek> want = parse(days);
        LocalDate from = effectiveFrom == null ? LocalDate.now().plusDays(1) : effectiveFrom;
        if (from.isBefore(LocalDate.now())) throw ApiException.bad("The new weekly off cannot start in the past");
        if (from.isAfter(LocalDate.now().plusDays(60))) throw ApiException.bad("Choose a start date within the next 60 days");
        Integer pending = db.sql("SELECT COUNT(*) FROM off_day_requests WHERE employee_id = ? AND status = 'PENDING'").param(employeeId).query(Integer.class).single();
        if (pending > 0) throw ApiException.conflict("You already have a weekly off request waiting for HR");
        Integer recent = db.sql("SELECT COUNT(*) FROM off_day_requests WHERE employee_id = ? AND status = 'APPROVED' AND decided_at >= ?")
                .param(employeeId).param(LocalDateTime.now().minusDays(COOLDOWN_DAYS)).query(Integer.class).single();
        if (recent > 0) throw ApiException.conflict("You can change your weekly off once every " + COOLDOWN_DAYS + " days");
        if (resolver(employeeId).apply(from).equals(want)) throw ApiException.bad("That is already your weekly off");
        if (reason == null || reason.isBlank()) throw ApiException.bad("Please give a reason");
        var kh = new org.springframework.jdbc.support.GeneratedKeyHolder();
        db.sql("INSERT INTO off_day_requests (employee_id, off_days, effective_from, reason) VALUES (?,?,?,?)")
                .param(employeeId).param(csv(want)).param(from).param(reason.trim()).update(kh, "id");
        return kh.getKey().longValue();
    }

    public List<Request> mine(long employeeId) {
        return db.sql(REQ_SELECT + " WHERE r.employee_id = ? ORDER BY r.id DESC").param(employeeId).query(Request.class).list();
    }

    public List<Request> byStatus(String status) {
        return db.sql(REQ_SELECT + " WHERE r.status = ? ORDER BY r.id").param(status).query(Request.class).list();
    }

    @Transactional
    public void cancel(long employeeId, long requestId) {
        int n = db.sql("UPDATE off_day_requests SET status = 'CANCELLED', decided_at = ? WHERE id = ? AND employee_id = ? AND status = 'PENDING'")
                .param(LocalDateTime.now()).param(requestId).param(employeeId).update();
        if (n == 0) throw ApiException.notFound("Pending request");
    }

    /** Approve gives the employee the new off day; reject leaves things as they were. */
    @Transactional
    public void decide(long requestId, boolean approve, String note, long hrId) {
        Request r = db.sql(REQ_SELECT + " WHERE r.id = ?").param(requestId).query(Request.class).optional().orElse(null);
        if (r == null) throw ApiException.notFound("Request");
        if (!"PENDING".equals(r.status())) throw ApiException.conflict("That request was already " + r.status().toLowerCase());
        if (approve) {
            LocalDate from = r.effectiveFrom().isBefore(LocalDate.now()) ? LocalDate.now() : r.effectiveFrom();
            insertRule(r.employeeId(), r.offDays(), from, "REQUEST", hrId);
        }
        db.sql("UPDATE off_day_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?")
                .param(approve ? "APPROVED" : "REJECTED").param(hrId).param(LocalDateTime.now()).param(note == null || note.isBlank() ? null : note.trim()).param(requestId).update();
    }
}
