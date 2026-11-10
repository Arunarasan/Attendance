package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** HR can edit an employee's sign-in identifiers, and the list reports face / app / phone status. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:empedit;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class EmployeeEditTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    static String admin;
    static long a, b;

    JsonNode call(HttpMethod m, String url, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (admin != null) h.setBearerAuth(admin);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    JsonNode row(long id) throws Exception {
        for (JsonNode n : call(HttpMethod.GET, "/api/hr/employees", null, 200)) if (n.get("id").asLong() == id) return n;
        return fail("employee " + id + " not listed");
    }

    @Test @Order(1)
    void setup() throws Exception {
        admin = null;
        admin = http.postForObject("/api/auth/login", Map.of("email", "admin@example.com", "password", "ChangeMe123!"), JsonNode.class).get("token").asText();
        a = call(HttpMethod.POST, "/api/hr/employees", Map.of("employeeCode", "E1", "name", "Eva", "email", "eva@example.com", "phone", "9000000031", "password", "password123"), 200).get("id").asLong();
        b = call(HttpMethod.POST, "/api/hr/employees", Map.of("employeeCode", "E2", "name", "Eli", "email", "eli@example.com", "phone", "9000000032", "password", "password123"), 200).get("id").asLong();
    }

    @Test @Order(2)
    void editsCodeEmailAndPay() throws Exception {
        JsonNode r = call(HttpMethod.PUT, "/api/hr/employees/" + a, Map.of("employeeCode", "E1X", "email", "Eva.New@Example.com", "hourlyRate", 150), 200);
        assertEquals("E1X", r.get("employeeCode").asText());
        assertEquals("eva.new@example.com", r.get("email").asText());
        assertEquals(150, r.get("hourlyRate").asInt());
        assertEquals("Eva", r.get("name").asText()); // untouched
    }

    @Test @Order(3)
    void duplicateOrBlankIsRefused() throws Exception {
        call(HttpMethod.PUT, "/api/hr/employees/" + a, Map.of("employeeCode", "E2"), 409);
        call(HttpMethod.PUT, "/api/hr/employees/" + a, Map.of("email", "eli@example.com"), 409);
        call(HttpMethod.PUT, "/api/hr/employees/" + a, Map.of("email", " "), 400);
        assertEquals("E1X", row(a).get("employeeCode").asText());
    }

    @Test @Order(4)
    void listShowsStatusFlags() throws Exception {
        JsonNode before = row(a);
        assertFalse(before.get("faceEnrolled").asBoolean());
        assertFalse(before.get("appPaired").asBoolean());
        assertFalse(before.get("phoneApproved").asBoolean());
        call(HttpMethod.POST, "/api/hr/employees/" + a + "/face", Map.of("descriptors", List.of(java.util.Collections.nCopies(128, 0.1))), 200);
        assertTrue(row(a).get("faceEnrolled").asBoolean());
        assertFalse(row(b).get("faceEnrolled").asBoolean());
    }
}
