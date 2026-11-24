package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** HR can switch the location check, the Wi-Fi check and kiosk punching on or off per employee. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:empchecks;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class EmployeeChecksTest {
    @Autowired TestRestTemplate http;

    @Test
    void switchesDefaultOnAndSaveIndependently() {
        String admin = http.postForObject("/api/auth/login", Map.of("email", "admin@example.com", "password", "ChangeMe123!"), JsonNode.class).get("token").asText();
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(admin);
        JsonNode created = http.exchange("/api/hr/employees", HttpMethod.POST, new HttpEntity<>(Map.of("employeeCode", "C1", "name", "Cy", "email", "cy@example.com",
                "phone", "9000000077", "password", "password123"), h), JsonNode.class).getBody();
        long id = created.get("id").asLong();

        JsonNode row = find(h, id);
        assertTrue(row.get("requireLocation").asBoolean() && row.get("requireWifi").asBoolean() && row.get("allowKiosk").asBoolean());

        assertEquals(200, http.exchange("/api/hr/employees/" + id + "/checks", HttpMethod.PUT, new HttpEntity<>(Map.of("requireWifi", false), h), String.class).getStatusCode().value());
        row = find(h, id);
        assertFalse(row.get("requireWifi").asBoolean());
        assertTrue(row.get("requireLocation").asBoolean());   // untouched
        assertTrue(row.get("allowKiosk").asBoolean());

        assertEquals(404, http.exchange("/api/hr/employees/99999/checks", HttpMethod.PUT, new HttpEntity<>(Map.of("allowKiosk", false), h), String.class).getStatusCode().value());
    }

    private JsonNode find(HttpHeaders h, long id) {
        for (JsonNode n : http.exchange("/api/hr/employees", HttpMethod.GET, new HttpEntity<>(h), JsonNode.class).getBody()) if (n.get("id").asLong() == id) return n;
        return fail("not listed");
    }
}
