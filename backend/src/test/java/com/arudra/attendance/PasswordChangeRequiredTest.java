package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression for the audit finding "the shipped default admin password stays valid".
 * An account that still has the default password can sign in, but the server refuses everything except reading its own
 * profile and changing the password; after the change it works normally and cannot go back to the default.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.enforce-password-change=true",
        "spring.datasource.url=jdbc:h2:mem:pwchange;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PasswordChangeRequiredTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @Autowired JdbcClient db;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
    @Autowired com.arudra.attendance.service.Jobs jobs;

    static String token;

    private ResponseEntity<String> call(HttpMethod m, String url, String bearer, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        return http.exchange(url, m, new HttpEntity<>(body, h), String.class);
    }

    @Test @Order(1)
    void seededAdminIsFlaggedAndOnlyProfileAndPasswordWork() throws Exception {
        ResponseEntity<String> login = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"));
        assertEquals(200, login.getStatusCode().value(), login.getBody());
        JsonNode body = json.readTree(login.getBody());
        token = body.get("token").asText();
        assertTrue(body.get("employee").get("mustChangePassword").asBoolean(), "the profile says a change is required");

        assertEquals(200, call(HttpMethod.GET, "/api/me", token, null).getStatusCode().value(), "own profile stays readable");
        for (String url : new String[]{"/api/hr/employees", "/api/hr/payroll/runs", "/api/me/today", "/api/hr/settings"}) {
            ResponseEntity<String> r = call(HttpMethod.GET, url, token, null);
            assertEquals(403, r.getStatusCode().value(), url + " -> " + r.getBody());
            assertEquals("PASSWORD_CHANGE_REQUIRED", json.readTree(r.getBody()).get("code").asText());
        }
        assertEquals(403, call(HttpMethod.POST, "/api/hr/employees", token,
                Map.of("employeeCode", "X1", "name", "X", "email", "x@example.com", "phone", "9123456780", "password", "password123")).getStatusCode().value());
    }

    @Test @Order(2)
    void thePasswordCannotBeChangedToTheDefaultOrSomethingShort() {
        assertEquals(400, call(HttpMethod.POST, "/api/me/password", token, Map.of("currentPassword", "ChangeMe123!", "newPassword", "ChangeMe123!")).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/me/password", token, Map.of("currentPassword", "ChangeMe123!", "newPassword", "short")).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, "/api/me/password", token, Map.of("currentPassword", "wrong-current", "newPassword", "a-brand-new-password")).getStatusCode().value());
        assertEquals(403, call(HttpMethod.GET, "/api/hr/employees", token, null).getStatusCode().value(), "still locked after failed attempts");
    }

    @Test @Order(3)
    void afterChangingThePasswordEverythingWorksAndTheOldOneIsGone() throws Exception {
        assertEquals(200, call(HttpMethod.POST, "/api/me/password", token, Map.of("currentPassword", "ChangeMe123!", "newPassword", "a-brand-new-password")).getStatusCode().value());
        assertEquals(200, call(HttpMethod.GET, "/api/hr/employees", token, null).getStatusCode().value(), "same token works now");
        assertFalse(json.readTree(call(HttpMethod.GET, "/api/me", token, null).getBody()).get("mustChangePassword").asBoolean());
        assertEquals(401, call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!")).getStatusCode().value());
        assertEquals(200, call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "a-brand-new-password")).getStatusCode().value());
    }

    @Test @Order(4)
    void anOlderAccountStillOnTheDefaultIsFlaggedAtStartup() {
        // A database created by an older version: HR accounts with no flag, one still on the default password.
        db.sql("INSERT INTO employees (employee_code, name, email, password_hash, role) VALUES ('OLD1', 'Old default', 'old1@example.com', ?, 'HR')")
                .param(encoder.encode("ChangeMe123!")).update();
        db.sql("INSERT INTO employees (employee_code, name, email, password_hash, role) VALUES ('OLD2', 'Old changed', 'old2@example.com', ?, 'HR')")
                .param(encoder.encode("something-else-entirely")).update();
        jobs.run(null); // what happens at every start
        assertTrue(db.sql("SELECT must_change_password FROM employees WHERE employee_code = 'OLD1'").query(Boolean.class).single());
        assertFalse(db.sql("SELECT must_change_password FROM employees WHERE employee_code = 'OLD2'").query(Boolean.class).single());
    }
}
