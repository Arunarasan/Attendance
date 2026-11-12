package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression for the audit findings on input validation (BUG-03, 05, 06, 11), the HR-versus-admin boundary (BUG-10)
 * and the response headers (BUG-12). Bad input must be a 400 (never a 500) and must not be saved.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:inputrules;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class InputRulesTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    static String admin, hr;
    static long empId;
    static long adminTwoId;

    private ResponseEntity<String> call(HttpMethod m, String url, String bearer, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        return http.exchange(url, m, new HttpEntity<>(body, h), String.class);
    }

    private JsonNode ok(ResponseEntity<String> r) throws Exception {
        assertEquals(200, r.getStatusCode().value(), r.getBody());
        return json.readTree(r.getBody());
    }

    private static Map<String, Object> emp(String code, Object... extra) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("employeeCode", code);
        m.put("name", "Name " + code);
        m.put("email", code.toLowerCase() + "@example.com");
        m.put("phone", "9" + String.format("%09d", Math.abs(code.hashCode()) % 1_000_000_000));
        m.put("password", "password123");
        m.put("role", "EMPLOYEE");
        for (int i = 0; i < extra.length; i += 2) m.put((String) extra[i], extra[i + 1]);
        return m;
    }

    @BeforeAll
    static void noop() {}

    @Test @Order(1)
    void setup() throws Exception {
        admin = ok(call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"))).get("token").asText();
        empId = ok(call(HttpMethod.POST, "/api/hr/employees", admin, emp("E100"))).get("id").asLong();
        adminTwoId = ok(call(HttpMethod.POST, "/api/hr/employees", admin, emp("A200", "role", "ADMIN"))).get("id").asLong();
        ok(call(HttpMethod.POST, "/api/hr/employees", admin, emp("H300", "role", "HR")));
        hr = ok(call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "h300@example.com", "password", "password123"))).get("token").asText();
    }

    @Test @Order(2)
    void employeeFieldsAreBoundedAndNeverCrashTheServer() {
        assertEquals(400, call(HttpMethod.POST, "/api/hr/employees", admin, emp("E101", "hourlyRate", -50)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/employees", admin, emp("E102", "baseSalary", -1)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/employees", admin, emp("E103", "hourlyRate", 1_000_000_000)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/employees", admin, emp("E104", "name", "N".repeat(5000))).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/employees", admin, emp("E105", "email", "e".repeat(200) + "@x.com")).getStatusCode().value());
        assertEquals(400, call(HttpMethod.PUT, "/api/hr/employees/" + empId, admin, Map.of("hourlyRate", -5)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.PUT, "/api/hr/employees/" + empId, admin, Map.of("name", "N".repeat(5000))).getStatusCode().value());
    }

    @Test @Order(3)
    void locationRangesAreChecked() {
        Map<String, Object> good = Map.of("name", "HQ", "latitude", 12.97, "longitude", 77.59, "radiusMeters", 100);
        assertEquals(200, call(HttpMethod.POST, "/api/hr/attendance/locations", admin, good).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/attendance/locations", admin, Map.of("name", "X", "latitude", 999, "longitude", 77.59, "radiusMeters", 100)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/attendance/locations", admin, Map.of("name", "X", "latitude", 12.9, "longitude", -181, "radiusMeters", 100)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/attendance/locations", admin, Map.of("name", "X", "latitude", 12.9, "longitude", 77.5, "radiusMeters", 999_999_999)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/attendance/locations", admin, Map.of("name", "N".repeat(500), "latitude", 12.9, "longitude", 77.5, "radiusMeters", 100)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.PUT, "/api/hr/attendance/locations/1", admin, Map.of("latitude", 95)).getStatusCode().value());
    }

    @Test @Order(4)
    void futureCorrectionsAreRefused() throws Exception {
        LocalDate future = LocalDate.now().plusDays(30);
        ResponseEntity<String> r = call(HttpMethod.POST, "/api/hr/attendance/corrections/apply", admin,
                Map.of("employeeId", empId, "date", future.toString(), "checkIn", future + "T09:00:00", "checkOut", future + "T17:00:00"));
        assertEquals(400, r.getStatusCode().value(), r.getBody());
        LocalDate past = LocalDate.now().minusDays(2);
        assertEquals(200, call(HttpMethod.POST, "/api/hr/attendance/corrections/apply", admin,
                Map.of("employeeId", empId, "date", past.toString(), "checkIn", past + "T09:00:00", "checkOut", past + "T17:00:00")).getStatusCode().value());
    }

    @Test @Order(5)
    void payrollAdjustmentIsBoundedNotACrash() throws Exception {
        ok(call(HttpMethod.POST, "/api/hr/payroll/generate", admin, Map.of("period", "2026-01", "mode", "MONTHLY")));
        JsonNode slips = ok(call(HttpMethod.GET, "/api/hr/payroll/runs/1/payslips", admin, null));
        long slip = slips.get(0).get("id").asLong();
        assertEquals(400, call(HttpMethod.POST, "/api/hr/payroll/payslips/" + slip + "/adjust", admin, Map.of("amount", "999999999999999")).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/hr/payroll/payslips/" + slip + "/adjust", admin, Map.of("amount", "-999999999999999")).getStatusCode().value());
        assertEquals(200, call(HttpMethod.POST, "/api/hr/payroll/payslips/" + slip + "/adjust", admin, Map.of("amount", 250.5)).getStatusCode().value());
    }

    @Test @Order(6)
    void hrCannotCreateOrChangeAdmins_butAdminsCan() {
        // create an admin / promote to admin
        assertEquals(403, call(HttpMethod.POST, "/api/hr/employees", hr, emp("X400", "role", "ADMIN")).getStatusCode().value());
        assertEquals(403, call(HttpMethod.PUT, "/api/hr/employees/" + empId, hr, Map.of("role", "ADMIN")).getStatusCode().value());
        // edit, reset the password of, deactivate, or pair a phone to an existing admin
        assertEquals(403, call(HttpMethod.PUT, "/api/hr/employees/" + adminTwoId, hr, Map.of("active", false)).getStatusCode().value());
        assertEquals(403, call(HttpMethod.PUT, "/api/hr/employees/" + adminTwoId, hr, Map.of("password", "newpassword123")).getStatusCode().value());
        assertEquals(403, call(HttpMethod.POST, "/api/hr/employees/" + adminTwoId + "/app-code", hr, null).getStatusCode().value());
        // the old password still works, so nothing was changed
        assertEquals(200, call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "a200@example.com", "password", "password123")).getStatusCode().value());
        // HR can still do ordinary HR work
        assertEquals(200, call(HttpMethod.POST, "/api/hr/employees", hr, emp("E500")).getStatusCode().value());
        assertEquals(200, call(HttpMethod.PUT, "/api/hr/employees/" + empId, hr, Map.of("name", "Renamed by HR")).getStatusCode().value());
        // an admin can manage admins
        assertEquals(200, call(HttpMethod.PUT, "/api/hr/employees/" + adminTwoId, admin, Map.of("name", "Second Admin")).getStatusCode().value());
    }

    @Test @Order(7)
    void responsesCarryHardeningHeaders() {
        HttpHeaders h = http.exchange("/api/public/config", HttpMethod.GET, HttpEntity.EMPTY, String.class).getHeaders();
        assertNotNull(h.getFirst("Strict-Transport-Security"));
        assertTrue(h.getFirst("Content-Security-Policy").contains("default-src 'none'"));
        assertEquals("no-referrer", h.getFirst("Referrer-Policy"));
        assertEquals("nosniff", h.getFirst("X-Content-Type-Options"));
        assertEquals("DENY", h.getFirst("X-Frame-Options"));
    }

    @Test @Order(8)
    void wrongMethodUsesTheAppErrorFormat() throws Exception {
        ResponseEntity<String> r = call(HttpMethod.DELETE, "/api/hr/employees/" + empId, admin, null);
        assertEquals(405, r.getStatusCode().value());
        assertEquals("METHOD_NOT_ALLOWED", json.readTree(r.getBody()).get("code").asText());
    }
}
