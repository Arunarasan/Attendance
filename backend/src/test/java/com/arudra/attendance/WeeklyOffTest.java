package com.arudra.attendance;

import com.arudra.attendance.service.CalendarService;
import com.arudra.attendance.service.OffDayService;
import com.arudra.attendance.service.OffDayService.Rule;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/** Weekly off per employee: rule resolution, HR assignment, and the employee request that only counts once HR approves. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:weeklyoff;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class WeeklyOffTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @Autowired JdbcClient db;
    @Autowired CalendarService calendar;

    static String admin, emp;
    static long empId;

    JsonNode call(HttpMethod m, String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    // ---- pure resolution ----

    @Test @Order(0)
    void newestRuleStartingOnOrBeforeTheDateWins() {
        Set<DayOfWeek> company = Set.of(DayOfWeek.SUNDAY);
        LocalDate d = LocalDate.of(2026, 11, 10);
        List<Rule> rules = List.of(
                new Rule(1, 1, "WED", LocalDate.of(2026, 10, 1), "HR", null),
                new Rule(2, 1, "FRI", LocalDate.of(2026, 11, 5), "REQUEST", null),
                new Rule(3, 1, "TUE", LocalDate.of(2026, 12, 1), "HR", null));
        assertEquals(company, OffDayService.resolve(List.of(), d, company));                       // no rule: company default
        assertEquals(Set.of(DayOfWeek.WEDNESDAY), OffDayService.resolve(rules, LocalDate.of(2026, 10, 20), company));
        assertEquals(Set.of(DayOfWeek.FRIDAY), OffDayService.resolve(rules, d, company));           // newer rule replaces the older
        assertEquals(Set.of(DayOfWeek.FRIDAY), OffDayService.resolve(rules, LocalDate.of(2026, 11, 30), company)); // future rule not yet active
        assertEquals(company, OffDayService.resolve(rules, LocalDate.of(2026, 9, 1), company));     // before any rule
        assertEquals(company, OffDayService.resolve(List.of(new Rule(1, 1, "DEFAULT", d, "HR", null)), d, company)); // back to default
        assertEquals(Set.of(DayOfWeek.MONDAY, DayOfWeek.THURSDAY), OffDayService.resolve(List.of(new Rule(1, 1, "MON,THU", d, "HR", null)), d, company));
    }

    // ---- through the API ----

    @Test @Order(1)
    void setup() throws Exception {
        admin = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        Map<String, Object> e = new HashMap<>();
        e.put("employeeCode", "WO1"); e.put("name", "Week Off"); e.put("email", "wo1@example.com"); e.put("phone", "9000000051");
        e.put("password", "password123"); e.put("role", "EMPLOYEE");
        empId = call(HttpMethod.POST, "/api/hr/employees", admin, e, 200).get("id").asLong();
        emp = call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "WO1", "password", "password123"), 200).get("token").asText();
        call(HttpMethod.PUT, "/api/hr/settings", admin, Map.of("weeklyOffDays", List.of("SUNDAY")), 200);
    }

    @Test @Order(2)
    void everyoneStartsOnTheCompanyDefault() throws Exception {
        JsonNode cur = call(HttpMethod.GET, "/api/me/off-days", emp, null, 200).get("current");
        assertTrue(cur.get("companyDefault").asBoolean());
        assertEquals("SUNDAY", cur.get("days").get(0).asText());
    }

    @Test @Order(3)
    void hrAssignmentIsValidated() throws Exception {
        String url = "/api/hr/employees/" + empId + "/off-days";
        call(HttpMethod.PUT, url, admin, Map.of("days", List.of()), 400);                                          // at least one day
        call(HttpMethod.PUT, url, admin, Map.of("days", List.of("MON", "TUE", "WED")), 400);                       // at most two
        call(HttpMethod.PUT, url, admin, Map.of("days", List.of("WED"), "validFrom", LocalDate.now().minusDays(1).toString()), 400); // not in the past
        call(HttpMethod.PUT, url, null, Map.of("days", List.of("WED")), 401);
        call(HttpMethod.PUT, url, emp, Map.of("days", List.of("WED")), 403);                                       // employees cannot assign
    }

    @Test @Order(4)
    void employeeRequestOnlyCountsOnceHrApproves() throws Exception {
        Map<String, Object> req = new HashMap<>();
        req.put("days", List.of("FRIDAY")); req.put("reason", "Family commitment on Fridays");
        call(HttpMethod.POST, "/api/me/off-days/request", emp, Map.of("days", List.of("FRIDAY")), 400);   // reason is required
        call(HttpMethod.POST, "/api/me/off-days/request", emp, Map.of("days", List.of("SUNDAY"), "reason", "same"), 400); // already their off day
        long id = call(HttpMethod.POST, "/api/me/off-days/request", emp, req, 200).get("id").asLong();
        call(HttpMethod.POST, "/api/me/off-days/request", emp, req, 409);                                 // one waiting request at a time

        // not approved yet: nothing changes
        JsonNode cur = call(HttpMethod.GET, "/api/me/off-days", emp, null, 200).get("current");
        assertTrue(cur.get("companyDefault").asBoolean());
        assertEquals(1, call(HttpMethod.GET, "/api/hr/off-day-requests", admin, null, 200).size());

        // HR rejects: still nothing changes, and the employee can ask again
        call(HttpMethod.POST, "/api/hr/off-day-requests/" + id + "/reject", admin, Map.of("note", "Busy that day"), 200);
        call(HttpMethod.POST, "/api/hr/off-day-requests/" + id + "/approve", admin, Map.of(), 409);       // already decided
        cur = call(HttpMethod.GET, "/api/me/off-days", emp, null, 200).get("current");
        assertTrue(cur.get("companyDefault").asBoolean());
        long id2 = call(HttpMethod.POST, "/api/me/off-days/request", emp, req, 200).get("id").asLong();

        // the employee can withdraw a waiting request
        call(HttpMethod.POST, "/api/me/off-days/requests/" + id2 + "/cancel", emp, Map.of(), 200);
        call(HttpMethod.POST, "/api/me/off-days/requests/" + id2 + "/cancel", emp, Map.of(), 404);
        long id3 = call(HttpMethod.POST, "/api/me/off-days/request", emp, req, 200).get("id").asLong();

        // HR approves: the new day is given (from tomorrow, the default start date)
        call(HttpMethod.POST, "/api/hr/off-day-requests/" + id3 + "/approve", admin, Map.of("note", "Approved"), 200);
        JsonNode mine = call(HttpMethod.GET, "/api/me/off-days", emp, null, 200);
        assertEquals("FRIDAY", mine.get("current").get("upcomingDays").get(0).asText());
        assertEquals(LocalDate.now().plusDays(1).toString(), mine.get("current").get("upcomingFrom").asText());

        // and they cannot change it again straight away
        req.put("days", List.of("MONDAY"));
        call(HttpMethod.POST, "/api/me/off-days/request", emp, req, 409);
    }

    @Test @Order(5)
    void workingDaysFollowTheEmployeesOwnWeeklyOff() throws Exception {
        // Mon 2 Nov - Sat 7 Nov 2026 is six days. With Sunday off all six count; with Wednesday off only five.
        db.sql("DELETE FROM employee_off_rules WHERE employee_id = ?").param(empId).update(); // the approved Friday rule starts tomorrow; keep this test independent of today's date
        LocalDate mon = LocalDate.of(2026, 11, 2), sat = LocalDate.of(2026, 11, 7);
        assertEquals(6, calendar.workdaysBetween(empId, mon, sat, false), 0.001);
        assertEquals(25, calendar.scheduledDaysIn(empId, YearMonth.of(2026, 11)));   // 30 days minus 5 Sundays

        db.sql("INSERT INTO employee_off_rules (employee_id, off_days, valid_from, source) VALUES (?,?,?,?)")
                .param(empId).param("WED").param(LocalDate.of(2020, 1, 1)).param("HR").update();
        assertEquals(5, calendar.workdaysBetween(empId, mon, sat, false), 0.001);
        assertEquals(26, calendar.scheduledDaysIn(empId, YearMonth.of(2026, 11)));   // 30 days minus 4 Wednesdays
        assertEquals(7, calendar.workdaysBetween(empId, mon, mon.plusDays(6), false) + 1, 0.001); // Sunday is now a working day

        // a paid holiday on the employee's weekly off is not a paid day for them
        db.sql("INSERT INTO holidays (holiday_date, name, paid) VALUES (?,?,TRUE)").param(LocalDate.of(2026, 11, 4)).param("Wed holiday").update();
        db.sql("INSERT INTO holidays (holiday_date, name, paid) VALUES (?,?,TRUE)").param(LocalDate.of(2026, 11, 5)).param("Thu holiday").update();
        assertEquals(1, calendar.paidHolidayWorkdays(empId, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30)));
    }

    @Test @Order(6)
    void hrCanAssignAndResetToTheCompanyDefault() throws Exception {
        String url = "/api/hr/employees/" + empId + "/off-days";
        JsonNode r = call(HttpMethod.PUT, url, admin, Map.of("days", List.of("TUESDAY", "SATURDAY")), 200);
        assertEquals(2, r.get("current").get("days").size());
        assertEquals("HR", r.get("current").get("source").asText());
        Map<String, Object> reset = new HashMap<>();
        reset.put("days", null);
        r = call(HttpMethod.PUT, url, admin, reset, 200);
        assertTrue(r.get("current").get("companyDefault").asBoolean());
    }

    @Test @Order(7)
    void whenTwoChangesStartTheSameDayTheNewerOneIsShown() throws Exception {
        String url = "/api/hr/employees/" + empId + "/off-days";
        String tomorrow = LocalDate.now().plusDays(1).toString();
        call(HttpMethod.PUT, url, admin, Map.of("days", List.of("MONDAY"), "validFrom", tomorrow), 200);
        JsonNode r = call(HttpMethod.PUT, url, admin, Map.of("days", List.of("THURSDAY"), "validFrom", tomorrow), 200);
        assertEquals("THURSDAY", r.get("current").get("upcomingDays").get(0).asText());
        Map<String, Object> back = new HashMap<>();
        back.put("days", null); back.put("validFrom", tomorrow);
        r = call(HttpMethod.PUT, url, admin, back, 200);
        assertEquals("SUNDAY", r.get("current").get("upcomingDays").get(0).asText()); // the company default is what applies tomorrow
    }
}
