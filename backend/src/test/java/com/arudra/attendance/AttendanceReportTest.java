package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** The monthly register lists every active employee with one cell per day; the same endpoint serves one employee. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:attreport;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class AttendanceReportTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    ResponseEntity<String> get(String token, String url) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        return http.exchange(url, HttpMethod.GET, new HttpEntity<>(h), String.class);
    }

    @Test
    void registerAndPerEmployeeReport() throws Exception {
        String admin = http.postForObject("/api/auth/login", Map.of("email", "admin@example.com", "password", "ChangeMe123!"), JsonNode.class).get("token").asText();
        ResponseEntity<String> all = get(admin, "/api/hr/attendance/report?month=2020-02");
        assertEquals(200, all.getStatusCode().value(), all.getBody());
        JsonNode r = json.readTree(all.getBody());
        assertEquals(29, r.get("days").size());                      // leap-year February
        JsonNode line = r.get("employees").get(0);
        assertEquals(29, line.get("cells").size());
        assertEquals(29, line.get("weeklyOff").asInt() + line.get("absent").asInt() + line.get("holiday").asInt()
                + line.get("leave").asInt() + line.get("present").asInt() + line.get("noCheckout").asInt());

        long id = line.get("id").asLong();
        JsonNode one = json.readTree(get(admin, "/api/hr/attendance/report?month=2020-02&employeeId=" + id).getBody());
        assertEquals(1, one.get("employees").size());

        assertEquals(400, get(admin, "/api/hr/attendance/report?month=nope").getStatusCode().value());
        assertEquals(404, get(admin, "/api/hr/attendance/report?month=2020-02&employeeId=99999").getStatusCode().value());
    }
}
