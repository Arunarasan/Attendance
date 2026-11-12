package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** HR can remove all face data for a person (a leaver, or someone who withdraws consent) without touching their hours or pay. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:facedelete;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class FaceDeleteTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @Autowired JdbcClient db;

    private ResponseEntity<String> call(HttpMethod m, String url, String bearer, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        return http.exchange(url, m, new HttpEntity<>(body, h), String.class);
    }

    private boolean faceEnrolled(String admin, long id) throws Exception {
        for (JsonNode e : json.readTree(call(HttpMethod.GET, "/api/hr/employees", admin, null).getBody()))
            if (e.get("id").asLong() == id) return e.get("faceEnrolled").asBoolean();
        throw new AssertionError("employee not listed");
    }

    @Test
    void removesTemplatesAndPhotosButKeepsHours() throws Exception {
        String admin = json.readTree(call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!")).getBody()).get("token").asText();
        long id = json.readTree(call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "F1", "name", "Face One", "email", "f1@example.com",
                "phone", "9123456711", "password", "password123")).getBody()).get("id").asLong();
        List<double[]> shots = new ArrayList<>();
        for (int s = 0; s < 3; s++) { double[] d = new double[128]; for (int i = 0; i < 128; i++) d[i] = Math.sin(i + s) * 0.1; shots.add(d); }
        assertEquals(200, call(HttpMethod.POST, "/api/hr/employees/" + id + "/face", admin, Map.of("descriptors", shots)).getStatusCode().value());
        assertTrue(faceEnrolled(admin, id));

        // an approved day of work, a punch photo and a face request photo, all for this person
        db.sql("INSERT INTO attendance_sessions (employee_id, work_date, clock_in, clock_out, source, verified, flagged, approval_status) VALUES (?, CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'PORTAL', TRUE, FALSE, 'APPROVED')").param(id).update();
        long session = db.sql("SELECT MAX(id) FROM attendance_sessions WHERE employee_id = ?").param(id).query(Long.class).single();
        db.sql("INSERT INTO punch_photos (session_id, kind, photo) VALUES (?, 'IN', ?)").param(session).param(new byte[]{1, 2, 3}).update();

        ResponseEntity<String> r = call(HttpMethod.DELETE, "/api/hr/employees/" + id + "/face", admin, null);
        assertEquals(200, r.getStatusCode().value(), r.getBody());
        assertTrue(json.readTree(r.getBody()).get("rowsRemoved").asInt() >= 4, "3 templates and 1 photo: " + r.getBody());
        assertFalse(faceEnrolled(admin, id));
        assertEquals(0, db.sql("SELECT COUNT(*) FROM punch_photos WHERE session_id = ?").param(session).query(Integer.class).single());
        assertEquals(1, db.sql("SELECT COUNT(*) FROM attendance_sessions WHERE id = ?").param(session).query(Integer.class).single(), "the hours stay");

        assertEquals(200, call(HttpMethod.DELETE, "/api/hr/employees/" + id + "/face", admin, null).getStatusCode().value(), "deleting twice is harmless");
        assertEquals(404, call(HttpMethod.DELETE, "/api/hr/employees/999999/face", admin, null).getStatusCode().value());
    }

    @Test
    void employeesCannotDeleteFaceData() throws Exception {
        String admin = json.readTree(call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!")).getBody()).get("token").asText();
        call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "F2", "name", "Face Two", "email", "f2@example.com", "phone", "9123456722", "password", "password123"));
        String emp = json.readTree(call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "F2", "phone", "9123456722", "password", "password123")).getBody()).get("token").asText();
        assertEquals(403, call(HttpMethod.DELETE, "/api/hr/employees/1/face", emp, null).getStatusCode().value());
    }
}
