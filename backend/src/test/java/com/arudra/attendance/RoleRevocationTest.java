package com.arudra.attendance;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Found while writing the audit report: the role used for access checks came from the signed login token, so someone
 * demoted from HR to employee kept HR access until their token expired (30 days). The role must come from the database.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:rolerevoke;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class RoleRevocationTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    private ResponseEntity<String> call(HttpMethod m, String url, String bearer, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        return http.exchange(url, m, new HttpEntity<>(body, h), String.class);
    }

    @Test
    void demotedUserLosesHrAccessWithTheTokenTheyAlreadyHold() throws Exception {
        String admin = json.readTree(call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!")).getBody()).get("token").asText();
        ResponseEntity<String> created = call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "H77", "name", "Was HR", "email", "h77@example.com",
                "phone", "9123456770", "password", "password123", "role", "HR"));
        long id = json.readTree(created.getBody()).get("id").asLong();
        String hrToken = json.readTree(call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "h77@example.com", "password", "password123")).getBody()).get("token").asText();
        assertEquals(200, call(HttpMethod.GET, "/api/hr/employees", hrToken, null).getStatusCode().value(), "HR works while HR");

        assertEquals(200, call(HttpMethod.PUT, "/api/hr/employees/" + id, admin, Map.of("role", "EMPLOYEE")).getStatusCode().value());
        assertEquals(403, call(HttpMethod.GET, "/api/hr/employees", hrToken, null).getStatusCode().value(), "the old token must not keep HR access");
        assertEquals(200, call(HttpMethod.GET, "/api/me", hrToken, null).getStatusCode().value(), "the account itself still works as an employee");
    }
}
