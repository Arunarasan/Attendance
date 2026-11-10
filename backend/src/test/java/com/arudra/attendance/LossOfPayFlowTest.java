package com.arudra.attendance;

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
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Loss of pay, pay mode per employee, allowances, honour score and the payroll preview, end to end on real rows. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:lopflow;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LossOfPayFlowTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @Autowired JdbcClient db;

    static String admin;
    static long empId;
    static final YearMonth PM = YearMonth.now().minusMonths(1);

    JsonNode call(HttpMethod m, String url, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (admin != null) h.setBearerAuth(admin);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    private void punch(LocalDate d, int workedMinutes, String in) {
        java.time.LocalTime t = java.time.LocalTime.parse(in);
        db.sql("INSERT INTO attendance (employee_id, work_date, check_in, check_out, break_minutes, worked_minutes, overtime_minutes) VALUES (?,?,?,?,0,?,?)")
                .param(empId).param(d).param(d.atTime(t)).param(d.atTime(t).plusMinutes(workedMinutes)).param(workedMinutes).param(Math.max(0, workedMinutes - 480)).update();
    }

    @Test @Order(1)
    void setup() throws Exception {
        admin = null;
        admin = call(HttpMethod.POST, "/api/auth/login", Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        Map<String, Object> e = new HashMap<>();
        e.put("employeeCode", "LOP1"); e.put("name", "Lop One"); e.put("email", "lop1@example.com"); e.put("phone", "9000000041");
        e.put("password", "password123"); e.put("role", "EMPLOYEE"); e.put("baseSalary", 26000); e.put("hourlyRate", 100);
        empId = call(HttpMethod.POST, "/api/hr/employees", e, 200).get("id").asLong();
        // weekly off Sunday only, so a 4 week window has predictable days
        call(HttpMethod.PUT, "/api/hr/settings", Map.of("weeklyOffDays", java.util.List.of("SUNDAY"), "defaultMode", "MONTHLY"), 200);
    }

    @Test @Order(2)
    void policyAndEmployeePayRoundTrip() throws Exception {
        JsonNode p = call(HttpMethod.GET, "/api/hr/policy", null, 200);
        assertFalse(p.get("lopEnabled").asBoolean());           // off until HR turns it on
        Map<String, Object> body = json.convertValue(p, Map.class);
        body.put("lopEnabled", true); body.put("bonusMinScore", 90); body.put("bonusAmount", 500);
        JsonNode saved = call(HttpMethod.PUT, "/api/hr/policy", body, 200);
        assertTrue(saved.get("lopEnabled").asBoolean());
        body.put("graceMinutes", 500);
        call(HttpMethod.PUT, "/api/hr/policy", body, 400);      // out of range is refused
        call(HttpMethod.PUT, "/api/hr/employees/" + empId + "/pay", Map.of("payMode", "MONTHLY", "allowances", 2600, "otEligible", true), 200);
        call(HttpMethod.PUT, "/api/hr/employees/" + empId + "/pay", Map.of("payMode", "WEEKLY"), 400);
        assertEquals("MONTHLY", call(HttpMethod.GET, "/api/hr/employees/" + empId + "/pay", null, 200).get("payMode").asText());
    }

    @Test @Order(3)
    void daysAreScoredAndLossOfPayReachesThePayslip() throws Exception {
        // Last month, Monday-Saturday working days. Backfilled punches: the engine starts at the earliest punch.
        LocalDate first = PM.atDay(1);
        int worked = 0;
        LocalDate d = first;
        int full = 0;
        for (; !d.isAfter(PM.atEndOfMonth()); d = d.plusDays(1)) {
            if (d.getDayOfWeek() == DayOfWeek.SUNDAY) continue;
            worked++;
            if (worked == 1) punch(d, 300, "09:00");        // half day
            else if (worked == 2) punch(d, 120, "09:00");   // too short: full loss
            else if (worked == 3) continue;                 // no punch at all: absent, full loss
            else { punch(d, 480, "09:00"); full++; }
        }
        JsonNode ds = call(HttpMethod.GET, "/api/hr/attendance/day-status?employeeId=" + empId + "&month=" + PM, null, 200);
        assertEquals(0.5 + 1 + 1, ds.get("lopDays").asDouble(), 0.001);

        // HR forgives the absent day with a reason
        LocalDate absentDay = null;
        for (JsonNode day : ds.get("days")) if ("ABSENT".equals(day.get("status").asText())) absentDay = LocalDate.parse(day.get("date").asText());
        assertNotNull(absentDay);
        call(HttpMethod.PUT, "/api/hr/attendance/lop-override", Map.of("employeeId", empId, "date", absentDay.toString(), "lopDays", 0, "reason", "  "), 400);
        call(HttpMethod.PUT, "/api/hr/attendance/lop-override", Map.of("employeeId", empId, "date", absentDay.toString(), "lopDays", 0, "reason", "Approved by manager"), 200);
        ds = call(HttpMethod.GET, "/api/hr/attendance/day-status?employeeId=" + empId + "&month=" + PM, null, 200);
        assertEquals(1.5, ds.get("lopDays").asDouble(), 0.001);

        // Preview and the saved payslip agree, and carry the loss of pay
        JsonNode prev = call(HttpMethod.POST, "/api/hr/payroll/preview", Map.of("period", PM.toString()), 200);
        JsonNode mine = null;
        for (JsonNode l : prev) if (l.get("employeeId").asLong() == empId) mine = l;
        assertNotNull(mine);
        assertTrue(mine.get("lopApplied").asBoolean());
        assertEquals(1.5, mine.get("lopDays").asDouble(), 0.001);
        assertEquals("MONTHLY", mine.get("mode").asText());
        assertEquals(2600, mine.get("allowances").asDouble(), 0.001);
        // base 26000 + allowances 2600 shrink by 1.5 of the month's working days; overtime is none (all days are exactly 8h or less)
        int wd = 0;
        for (LocalDate x = first; !x.isAfter(PM.atEndOfMonth()); x = x.plusDays(1)) if (x.getDayOfWeek() != DayOfWeek.SUNDAY) wd++;
        double expected = (26000 + 2600) * (wd - 1.5) / wd;
        assertEquals(expected, mine.get("gross").asDouble() - mine.get("bonus").asDouble(), 0.02);
        assertEquals((26000 + 2600) * 1.5 / wd, mine.get("lopAmount").asDouble(), 0.02);

        long runId = call(HttpMethod.POST, "/api/hr/payroll/generate", Map.of("period", PM.toString()), 200).get("runId").asLong();
        JsonNode slips = call(HttpMethod.GET, "/api/hr/payroll/runs/" + runId + "/payslips", null, 200);
        JsonNode slip = null;
        for (JsonNode s : slips) if (s.get("employeeId").asLong() == empId) slip = s;
        assertNotNull(slip);
        assertEquals(1.5, slip.get("lopDays").asDouble(), 0.001);
        assertEquals("MONTHLY", slip.get("payMode").asText());
        call(HttpMethod.POST, "/api/hr/payroll/generate", Map.of("period", PM.toString()), 409); // one run per month
    }

    @Test @Order(4)
    void honourScoreAndBonus() throws Exception {
        JsonNode all = call(HttpMethod.GET, "/api/hr/scores?month=" + PM, null, 200);
        JsonNode mine = null;
        for (JsonNode r : all) if (r.get("employeeId").asLong() == empId) mine = r.get("score");
        assertNotNull(mine);
        assertFalse(mine.get("score").isNull());
        assertTrue(mine.get("score").asInt() < 100);   // two bad days and a forgiven absence cost something
        assertTrue(mine.get("attendancePct").asDouble() < 100);
    }

    @Test @Order(5)
    void hourlyEmployeesAreNotAffectedByLossOfPayRules() throws Exception {
        call(HttpMethod.PUT, "/api/hr/employees/" + empId + "/pay", Map.of("payMode", "HOURLY", "allowances", 0, "otEligible", false), 200);
        JsonNode prev = call(HttpMethod.POST, "/api/hr/payroll/preview", Map.of("period", PM.toString()), 200);
        for (JsonNode l : prev) if (l.get("employeeId").asLong() == empId) {
            assertFalse(l.get("lopApplied").asBoolean());
            assertEquals("HOURLY", l.get("mode").asText());
            assertEquals(0, l.get("lopDays").asDouble(), 0.001);
        }
    }
}
