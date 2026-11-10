package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Face-only punch: no sign-in, the face says who it is. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.attendance.kiosk-min-gap-seconds=0",
        "spring.datasource.url=jdbc:h2:mem:facepunch;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FacePunchTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    static String admin;
    static long netId;

    static double[] face(double v) { double[] d = new double[128]; Arrays.fill(d, v); return d; }

    JsonNode call(HttpMethod m, String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    /** POST /api/public/face-punch with no credentials at all. */
    JsonNode punch(double[] descriptor, Double lat, Double lng) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("descriptor", descriptor);
        if (lat != null) { body.put("lat", lat); body.put("lng", lng); body.put("accuracy", 10); }
        return call(HttpMethod.POST, "/api/public/face-punch", null, body, 200);
    }

    JsonNode inside(double[] d) throws Exception { return punch(d, 12.9716, 77.5946); }

    String pendingReasons() throws Exception {
        StringBuilder sb = new StringBuilder();
        for (JsonNode n : call(HttpMethod.GET, "/api/hr/attendance/pending", admin, null, 200)) sb.append(n.path("flagReason").asText()).append("|");
        return sb.toString();
    }

    @Test @Order(1)
    void setup() throws Exception {
        admin = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        long a = call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "P1", "name", "Pia", "email", "pia@example.com", "phone", "9000000011", "password", "password123"), 200).get("id").asLong();
        long b = call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "P2", "name", "Paul", "email", "paul@example.com", "phone", "9000000012", "password", "password123"), 200).get("id").asLong();
        call(HttpMethod.POST, "/api/hr/employees/" + a + "/face", admin, Map.of("descriptors", List.of(face(0.1))), 200);
        call(HttpMethod.POST, "/api/hr/employees/" + b + "/face", admin, Map.of("descriptors", List.of(face(0.9))), 200);
        call(HttpMethod.POST, "/api/hr/attendance/locations", admin, Map.of("name", "HQ", "latitude", 12.9716, "longitude", 77.5946, "radiusMeters", 100), 200);
    }

    @Test @Order(2)
    void faceAloneClocksInAndOutWithoutLogin() throws Exception {
        JsonNode in = inside(face(0.1));
        assertEquals("CHECKED_IN", in.get("outcome").asText());
        assertEquals("Pia", in.get("employeeName").asText());
        assertFalse(in.get("flagged").asBoolean());
        assertEquals("CHECKED_OUT", inside(face(0.1)).get("outcome").asText());
        assertEquals("Paul", inside(face(0.9)).get("employeeName").asText()); // a different face is a different person
        inside(face(0.9));
    }

    @Test @Order(3)
    void unknownFaceIsNotRecognised() throws Exception {
        JsonNode r = inside(face(0.5)); // equally far from both enrolled faces
        assertEquals("NOT_RECOGNISED", r.get("outcome").asText());
        call(HttpMethod.POST, "/api/public/face-punch", null, Map.of("descriptor", new double[]{1, 2, 3}), 400);
    }

    @Test @Order(4)
    void outsideTheFenceOrWithoutLocationIsFlaggedForHr() throws Exception {
        JsonNode far = punch(face(0.1), 13.5, 77.5946);
        assertEquals("CHECKED_IN", far.get("outcome").asText());
        assertTrue(far.get("flagged").asBoolean());
        inside(face(0.1)); // out

        JsonNode none = punch(face(0.1), null, null);
        assertTrue(none.get("flagged").asBoolean());
        inside(face(0.1)); // out

        String reasons = pendingReasons();
        assertTrue(reasons.contains("Outside HQ"), reasons);
        assertTrue(reasons.contains("No location provided"), reasons);
    }

    @Test @Order(5)
    void weakMatchIsFlagged() throws Exception {
        JsonNode weak = inside(face(0.14)); // distance about 0.45: between the confident and weak limits
        assertEquals("Pia", weak.get("employeeName").asText());
        assertTrue(weak.get("flagged").asBoolean());
        inside(face(0.1)); // out
        assertTrue(pendingReasons().contains("Weak face match"));
    }

    @Test @Order(6)
    void offOfficeNetworkIsFlagged() throws Exception {
        call(HttpMethod.POST, "/api/hr/networks", admin, Map.of("name", "HQ router", "cidr", "10.0.0.0/8"), 200);
        for (JsonNode n : call(HttpMethod.GET, "/api/hr/networks", admin, null, 200)) netId = n.get("id").asLong();
        JsonNode r = inside(face(0.1));
        assertTrue(r.get("flagged").asBoolean());
        inside(face(0.1)); // out
        assertTrue(pendingReasons().contains("Not on the office network"));
        call(HttpMethod.PUT, "/api/hr/networks/" + netId, admin, Map.of("active", false), 200);
    }

    @Test @Order(7)
    void employeeCanEnrolTheirOwnFaceOnce() throws Exception {
        call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "P3", "name", "Pam", "email", "pam@example.com", "phone", "9000000013", "password", "password123"), 200);
        String t = call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "P3", "phone", "9000000013", "password", "password123"), 200).get("token").asText();
        assertFalse(call(HttpMethod.GET, "/api/me/face", t, null, 200).get("enrolled").asBoolean());
        call(HttpMethod.POST, "/api/me/face", t, Map.of("descriptors", List.of(face(0.3), face(0.31))), 200);
        assertTrue(call(HttpMethod.GET, "/api/me/face", t, null, 200).get("enrolled").asBoolean());
        call(HttpMethod.POST, "/api/me/face", t, Map.of("descriptors", List.of(face(0.7))), 409); // cannot swap it
        assertEquals("Pam", inside(face(0.3)).get("employeeName").asText());
        inside(face(0.3));
    }

    @Test @Order(8)
    void confidentCleanPunchesTeachTheSystemANewLook() throws Exception {
        // A look about 0.6 from the enrolled one is not recognised on its own...
        assertEquals("NOT_RECOGNISED", inside(face(0.153)).get("outcome").asText());
        // ...but a look 0.30 away is recognised confidently, and remembered.
        JsonNode a = inside(face(0.1265));
        assertEquals("Pia", a.get("employeeName").asText());
        assertEquals("CHECKED_IN", a.get("outcome").asText());
        assertFalse(a.get("flagged").asBoolean());
        inside(face(0.1265)); // out (nothing new to learn: it now matches exactly)
        // The earlier unrecognised look is now 0.30 from the learned one, so it works.
        JsonNode b = inside(face(0.153));
        assertEquals("Pia", b.get("employeeName").asText());
        assertEquals("CHECKED_IN", b.get("outcome").asText());
        assertFalse(b.get("flagged").asBoolean());
        inside(face(0.153)); // out
    }

    @Test @Order(9)
    void flaggedPunchesDoNotTeachAnything() throws Exception {
        // A look 0.30 from the learned 0.153 but punched from far away: flagged, so it must not be learned.
        JsonNode far = punch(face(0.1795), 13.5, 77.5946);
        assertEquals("Pia", far.get("employeeName").asText());
        assertTrue(far.get("flagged").asBoolean());
        inside(face(0.153)); // out
        assertEquals("NOT_RECOGNISED", inside(face(0.2060)).get("outcome").asText()); // 0.60 from 0.153 and no 0.1795 template
    }

    @Test @Order(10)
    void repeatedUnknownFacesAreThrottled() throws Exception {
        for (int i = 0; i < 17; i++) assertEquals("NOT_RECOGNISED", inside(face(0.5)).get("outcome").asText());
        call(HttpMethod.POST, "/api/public/face-punch", null, Map.of("descriptor", face(0.1)), 429);
    }
}
