package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Employees sign in with employee ID + phone number + password; HR and admin keep email + password. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:logintest;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LoginTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    static String admin;

    JsonNode call(String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, HttpMethod.POST, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    Map<String, Object> emp(String code, String phone) {
        return phone == null
                ? Map.of("employeeCode", code, "name", code, "email", code + "@example.com", "password", "password123")
                : Map.of("employeeCode", code, "name", code, "email", code + "@example.com", "phone", phone, "password", "password123");
    }

    @Test @Order(1)
    void phoneIsRequiredAndUnique() throws Exception {
        admin = call("/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        call("/api/hr/employees", admin, emp("L0", null), 400);
        call("/api/hr/employees", admin, emp("L1", "+91 98765-43210"), 200);
        call("/api/hr/employees", admin, emp("L2", "9876543210"), 409); // same number, different formatting
    }

    @Test @Order(2)
    void employeeSignsInWithIdPhoneAndPassword() throws Exception {
        JsonNode ok = call("/api/auth/employee-login", null, Map.of("employeeCode", "l1", "phone", "9876543210", "password", "password123"), 200);
        assertFalse(ok.get("token").asText().isBlank());
        // country code and formatting do not matter
        call("/api/auth/employee-login", null, Map.of("employeeCode", "L1", "phone", "+91 98765 43210", "password", "password123"), 200);
        // each wrong part is refused with the same message
        call("/api/auth/employee-login", null, Map.of("employeeCode", "L1", "phone", "9876543211", "password", "password123"), 401);
        call("/api/auth/employee-login", null, Map.of("employeeCode", "L1", "phone", "9876543210", "password", "nope-nope"), 401);
        call("/api/auth/employee-login", null, Map.of("employeeCode", "NOBODY", "phone", "9876543210", "password", "password123"), 401);
        call("/api/auth/employee-login", null, Map.of("employeeCode", "L1", "phone", "", "password", "password123"), 401);
    }

    @Test @Order(3)
    void employeesCannotUseEmailLoginButHrCan() throws Exception {
        call("/api/auth/login", null, Map.of("email", "L1@example.com", "password", "password123"), 403);
        call("/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200);
    }

    @Test @Order(4)
    void repeatedFailuresLockTheId() throws Exception {
        call("/api/hr/employees", admin, emp("L3", "9111111111"), 200);
        for (int i = 0; i < 5; i++) {
            call("/api/auth/employee-login", null, Map.of("employeeCode", "L3", "phone", "9111111111", "password", "wrong-wrong"), 401);
        }
        // locked now, even with the right details
        call("/api/auth/employee-login", null, Map.of("employeeCode", "L3", "phone", "9111111111", "password", "password123"), 429);
        // other IDs are unaffected
        call("/api/auth/employee-login", null, Map.of("employeeCode", "L1", "phone", "9876543210", "password", "password123"), 200);
    }
}
