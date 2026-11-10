package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Settings, holidays, leave types and requests, and how they flow into payroll. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:leavepay;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LeaveHolidayPayTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    static String admin, emp;
    static long empId;
    static final YearMonth PM = YearMonth.now().minusMonths(1);
    // A Monday in the previous month, and the days after it. Weekly off is Sunday, so d7 is not a working day.
    static LocalDate d1 = firstMondayAfter(PM.atDay(8));
    static LocalDate d(int n) { return d1.plusDays(n - 1); }
    static long casualId, sickId, lopId, reqMonToWed, reqHalf;

    static LocalDate firstMondayAfter(LocalDate from) {
        LocalDate x = from;
        while (x.getDayOfWeek() != DayOfWeek.MONDAY) x = x.plusDays(1);
        return x;
    }

    JsonNode call(HttpMethod m, String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    Map<String, Object> leave(long typeId, LocalDate from, LocalDate to, boolean half) {
        Map<String, Object> b = new HashMap<>();
        b.put("leaveTypeId", typeId); b.put("startDate", from.toString()); b.put("endDate", to.toString()); b.put("halfDay", half); b.put("reason", "test");
        return b;
    }

    @Test @Order(1)
    void setup() throws Exception {
        admin = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        empId = call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "V1", "name", "Vik", "email", "vik@example.com", "phone", "9000000031",
                "password", "password123", "hourlyRate", 100), 200).get("id").asLong();
        emp = call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "V1", "phone", "9000000031", "password", "password123"), 200).get("token").asText();
        for (JsonNode t : call(HttpMethod.GET, "/api/hr/leave/types", admin, null, 200)) {
            switch (t.get("code").asText()) {
                case "CL" -> casualId = t.get("id").asLong();
                case "SL" -> sickId = t.get("id").asLong();
                case "LOP" -> lopId = t.get("id").asLong();
                default -> { }
            }
        }
        assertTrue(casualId > 0 && sickId > 0 && lopId > 0);
    }

    @Test @Order(2)
    void settingsHaveDefaultsAndAreValidated() throws Exception {
        JsonNode s = call(HttpMethod.GET, "/api/hr/settings", admin, null, 200);
        assertEquals(8, s.get("standardDailyHours").asInt());
        assertEquals("SUNDAY", s.get("weeklyOffDays").get(0).asText());
        assertEquals("HOURLY", s.get("defaultMode").asText());
        call(HttpMethod.PUT, "/api/hr/settings", admin, Map.of("standardDailyHours", 0), 400);
        call(HttpMethod.PUT, "/api/hr/settings", admin, Map.of("overtimeMultiplier", 9), 400);
        call(HttpMethod.PUT, "/api/hr/settings", admin, Map.of("defaultMode", "WEEKLY"), 400);
        call(HttpMethod.PUT, "/api/hr/settings", admin, Map.of("weeklyOffDays", List.of("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")), 400);
        JsonNode changed = call(HttpMethod.PUT, "/api/hr/settings", admin, Map.of("standardDailyHours", 9, "weeklyOffDays", List.of("SAT", "SUN"), "overtimeMultiplier", 2), 200);
        assertEquals(2, changed.get("weeklyOffDays").size());
        call(HttpMethod.PUT, "/api/hr/settings", admin, Map.of("standardDailyHours", 8, "weeklyOffDays", List.of("SUN"), "overtimeMultiplier", 1.5), 200);
        call(HttpMethod.GET, "/api/hr/settings", emp, null, 403); // employees cannot read or change pay settings
    }

    @Test @Order(3)
    void holidaysAreManagedByHrAndVisibleToEmployees() throws Exception {
        call(HttpMethod.POST, "/api/hr/holidays", admin, Map.of("date", d(4).toString(), "name", "Founders day"), 200); // the Thursday
        call(HttpMethod.POST, "/api/hr/holidays", admin, Map.of("date", d(4).toString(), "name", "Again"), 409);
        call(HttpMethod.POST, "/api/hr/holidays", admin, Map.of("name", "No date"), 400);
        call(HttpMethod.POST, "/api/hr/holidays", emp, Map.of("date", d(5).toString(), "name", "Mine"), 403);
        JsonNode mine = call(HttpMethod.GET, "/api/me/holidays?year=" + d(4).getYear(), emp, null, 200);
        assertTrue(mine.toString().contains("Founders day"));
    }

    @Test @Order(4)
    void leaveTypesCanBeAddedAndEdited() throws Exception {
        call(HttpMethod.POST, "/api/hr/leave/types", admin, Map.of("code", "wfh", "name", "Work from home", "paid", true, "annualQuota", 0), 200);
        call(HttpMethod.POST, "/api/hr/leave/types", admin, Map.of("code", "WFH", "name", "Again"), 409);
        call(HttpMethod.POST, "/api/hr/leave/types", admin, Map.of("name", "No code"), 400);
        assertEquals(5, call(HttpMethod.GET, "/api/hr/leave/types", admin, null, 200).size());
    }

    @Test @Order(5)
    void requestsCountOnlyWorkingDays() throws Exception {
        // Mon..Wed: 3 working days
        JsonNode a = call(HttpMethod.POST, "/api/me/leave", emp, leave(casualId, d(1), d(3), false), 200);
        reqMonToWed = a.get("id").asLong();
        // Thu..Sun: Thu is a holiday and Sun is off, so only Fri and Sat count
        long thuSun = call(HttpMethod.POST, "/api/me/leave", emp, leave(sickId, d(4), d(7), false), 200).get("id").asLong();
        JsonNode mineList = call(HttpMethod.GET, "/api/me/leave", emp, null, 200);
        double days = 0;
        for (JsonNode r : mineList) if (r.get("id").asLong() == thuSun) days = r.get("days").asDouble();
        assertEquals(2.0, days);
        // a Sunday on its own, or a holiday on its own, has nothing to take
        call(HttpMethod.POST, "/api/me/leave", emp, leave(casualId, d(7), d(7), false), 400);
        call(HttpMethod.POST, "/api/me/leave", emp, leave(casualId, d(4), d(4), false), 400);
        // overlaps
        call(HttpMethod.POST, "/api/me/leave", emp, leave(casualId, d(2), d(2), false), 409);
        // bad ranges
        call(HttpMethod.POST, "/api/me/leave", emp, leave(casualId, d(10), d(9), false), 400);
        call(HttpMethod.POST, "/api/me/leave", emp, leave(casualId, d(9), d(10), true), 400); // half day must be one date
        // withdraw the Fri/Sat request: only while pending
        call(HttpMethod.POST, "/api/me/leave/" + thuSun + "/cancel", emp, null, 200);
        call(HttpMethod.POST, "/api/me/leave/" + thuSun + "/cancel", emp, null, 409);
    }

    @Test @Order(6)
    void quotaIsEnforcedPerTypeAndYear() throws Exception {
        // 3 weeks of sick leave is more than the 12-day quota
        JsonNode r = call(HttpMethod.POST, "/api/me/leave", emp, leave(sickId, d(9), d(9).plusDays(20), false), 400);
        assertTrue(r.get("message").asText().contains("left"), r.toString());
        JsonNode bal = call(HttpMethod.GET, "/api/me/leave/balances?year=" + d(1).getYear(), emp, null, 200);
        for (JsonNode b : bal) if (b.get("code").asText().equals("CL")) {
            assertEquals(3.0, b.get("pending").asDouble());
            assertEquals(9.0, b.get("remaining").asDouble());
        }
    }

    @Test @Order(7)
    void hrDecidesAndEmployeesCannot() throws Exception {
        call(HttpMethod.POST, "/api/hr/leave/requests/" + reqMonToWed + "/approve", emp, null, 403);
        assertEquals(1, call(HttpMethod.GET, "/api/hr/leave/requests?status=PENDING", admin, null, 200).size());
        call(HttpMethod.POST, "/api/hr/leave/requests/" + reqMonToWed + "/approve", admin, null, 200);
        call(HttpMethod.POST, "/api/hr/leave/requests/" + reqMonToWed + "/approve", admin, null, 409);
        call(HttpMethod.POST, "/api/me/leave/" + reqMonToWed + "/cancel", emp, null, 409); // approved: ask HR

        // half day next Monday, approved; and one unpaid day recorded by HR (approved at once)
        reqHalf = call(HttpMethod.POST, "/api/me/leave", emp, leave(casualId, d(8), d(8), true), 200).get("id").asLong();
        call(HttpMethod.POST, "/api/hr/leave/requests/" + reqHalf + "/approve", admin, null, 200);
        Map<String, Object> lop = new HashMap<>(leave(lopId, d(9), d(9), false));
        lop.put("employeeId", empId);
        assertEquals("APPROVED", call(HttpMethod.POST, "/api/hr/leave/requests", admin, lop, 200).get("status").asText());

        JsonNode b = call(HttpMethod.GET, "/api/hr/leave/balances/" + empId + "?year=" + d(1).getYear(), admin, null, 200);
        for (JsonNode x : b) if (x.get("code").asText().equals("CL")) assertEquals(3.5, x.get("used").asDouble());
    }

    @Test @Order(8)
    void registerShowsLeaveAndHolidays() throws Exception {
        JsonNode onLeave = call(HttpMethod.GET, "/api/hr/attendance/register?date=" + d(2), admin, null, 200);
        String seen = "";
        for (JsonNode r : onLeave) if (r.get("employeeCode").asText().equals("V1")) seen = r.path("leaveType").asText("");
        assertEquals("CL", seen);
        JsonNode hol = call(HttpMethod.GET, "/api/hr/attendance/register?date=" + d(4), admin, null, 200);
        assertEquals("Founders day", hol.get(0).path("holiday").asText());
    }

    @Test @Order(9)
    void payrollCreditsPaidLeaveAndHolidaysThenTakesDeductions() throws Exception {
        call(HttpMethod.POST, "/api/hr/deductions", admin, Map.of("name", "Welfare", "kind", "PERCENT", "amount", 10, "active", true), 200);
        call(HttpMethod.POST, "/api/hr/deductions", admin, Map.of("name", "Bad", "kind", "PERCENT", "amount", 150, "active", true), 400);
        call(HttpMethod.POST, "/api/hr/deductions", admin, Map.of("name", "Bad", "kind", "WEIRD", "amount", 1, "active", true), 400);

        long run = call(HttpMethod.POST, "/api/hr/payroll/generate", admin, Map.of("period", PM.toString()), 200).get("runId").asLong(); // mode: the default
        JsonNode slips = call(HttpMethod.GET, "/api/hr/payroll/runs/" + run + "/payslips", admin, null, 200);
        JsonNode mine = null;
        for (JsonNode s : slips) if (s.get("employeeId").asLong() == empId) mine = s;
        assertNotNull(mine);
        // paid leave 3 + 0.5 = 3.5 days, 1 paid holiday, 1 unpaid day: 4.5 days x 8 h = 36 h at 100
        assertEquals(3.5, mine.get("paidLeaveDays").asDouble());
        assertEquals(1.0, mine.get("holidayDays").asDouble());
        assertEquals(1.0, mine.get("unpaidLeaveDays").asDouble());
        assertEquals(36.0, mine.get("creditHours").asDouble());
        assertEquals(36.0, mine.get("regularHours").asDouble());
        assertEquals(3600.0, mine.get("gross").asDouble());
        assertEquals(360.0, mine.get("deductions").asDouble());
        assertEquals(3240.0, mine.get("net").asDouble());
        assertTrue(mine.get("deductionDetail").asText().contains("Welfare"));

        call(HttpMethod.POST, "/api/hr/payroll/payslips/" + mine.get("id").asLong() + "/adjust", admin, Map.of("amount", 100), 200);
        JsonNode own = call(HttpMethod.GET, "/api/me/payslips", emp, null, 200).get(0);
        assertEquals(3340.0, own.get("net").asDouble()); // gross - deductions + adjustment
        assertEquals(360.0, own.get("deductions").asDouble());
    }
}
