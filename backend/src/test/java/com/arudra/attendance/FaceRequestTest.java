package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** The face would not match: employee ID + phone + photo ask HR to approve the punch. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:facereq;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FaceRequestTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    static String admin, emp;

    static String jpeg(int size) {
        byte[] b = new byte[size];
        b[0] = (byte) 0xFF; b[1] = (byte) 0xD8; b[2] = (byte) 0xFF; b[3] = (byte) 0xE0;
        return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(b);
    }

    JsonNode call(HttpMethod m, String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    Map<String, Object> req(String code, String phone, String action, String photo) {
        Map<String, Object> b = new HashMap<>();
        b.put("employeeCode", code); b.put("phone", phone); b.put("action", action); b.put("photo", photo);
        b.put("lat", 12.9716); b.put("lng", 77.5946); b.put("accuracy", 10);
        return b;
    }

    long submit(String action) throws Exception {
        return call(HttpMethod.POST, "/api/public/face-request", null, req("R1", "9000000021", action, jpeg(2000)), 200).get("id").asLong();
    }

    JsonNode today() throws Exception { return call(HttpMethod.GET, "/api/me/today", emp, null, 200); }

    @Test @Order(1)
    void setup() throws Exception {
        admin = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "R1", "name", "Rita", "email", "rita@example.com", "phone", "9000000021", "password", "password123"), 200);
        emp = call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "R1", "phone", "9000000021", "password", "password123"), 200).get("token").asText();
    }

    @Test @Order(2)
    void badInputIsRefused() throws Exception {
        call(HttpMethod.POST, "/api/public/face-request", null, req("R1", "9999999999", "IN", jpeg(2000)), 401); // wrong phone
        call(HttpMethod.POST, "/api/public/face-request", null, req("R1", "9000000021", "MAYBE", jpeg(2000)), 400);
        call(HttpMethod.POST, "/api/public/face-request", null, req("R1", "9000000021", "IN", "data:image/png;base64," + Base64.getEncoder().encodeToString(new byte[]{(byte) 0x89, 'P', 'N', 'G', 1, 2, 3})), 400); // not a JPEG
        call(HttpMethod.POST, "/api/public/face-request", null, req("R1", "9000000021", "IN", jpeg(400_000)), 400); // too big
        call(HttpMethod.POST, "/api/public/face-request", null, req("R1", "9000000021", "IN", "not base64 !!"), 400);
        assertEquals(0, call(HttpMethod.GET, "/api/hr/face-requests", admin, null, 200).size());
    }

    @Test @Order(3)
    void requestWaitsForHrAndPhotoIsOnlyForHr() throws Exception {
        long id = submit("IN");
        JsonNode list = call(HttpMethod.GET, "/api/hr/face-requests", admin, null, 200);
        assertEquals(1, list.size());
        assertEquals("Rita", list.get(0).get("employeeName").asText());
        assertEquals("IN", list.get(0).get("action").asText());
        assertFalse(list.get(0).get("context").asText().isBlank());
        assertFalse(today().get("isOpen").asBoolean()); // nothing clocked until HR approves

        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(admin);
        ResponseEntity<byte[]> photo = http.exchange("/api/hr/face-requests/" + id + "/photo", HttpMethod.GET, new HttpEntity<>(h), byte[].class);
        assertEquals(200, photo.getStatusCode().value());
        assertEquals(MediaType.IMAGE_JPEG, photo.getHeaders().getContentType());
        assertEquals((byte) 0xFF, photo.getBody()[0]);
        assertEquals(401, http.getForEntity("/api/hr/face-requests/" + id + "/photo", String.class).getStatusCode().value());
        HttpHeaders eh = new HttpHeaders();
        eh.setBearerAuth(emp);
        assertEquals(403, http.exchange("/api/hr/face-requests/" + id + "/photo", HttpMethod.GET, new HttpEntity<>(eh), String.class).getStatusCode().value());
    }

    @Test @Order(4)
    void approvingClockInStartsAPaidSessionAtTheRequestTime() throws Exception {
        long id = call(HttpMethod.GET, "/api/hr/face-requests", admin, null, 200).get(0).get("id").asLong();
        call(HttpMethod.POST, "/api/hr/face-requests/" + id + "/approve", admin, null, 200);
        JsonNode t = today();
        assertTrue(t.get("isOpen").asBoolean());
        assertEquals("FACE_REQUEST", t.get("sessions").get(0).get("source").asText());
        assertEquals("APPROVED", t.get("sessions").get(0).get("approvalStatus").asText());
        call(HttpMethod.POST, "/api/hr/face-requests/" + id + "/approve", admin, null, 409); // already decided
        assertEquals(0, call(HttpMethod.GET, "/api/hr/face-requests", admin, null, 200).size());
    }

    @Test @Order(5)
    void impossibleRequestsCannotBeApproved() throws Exception {
        long in2 = submit("IN"); // already clocked in
        call(HttpMethod.POST, "/api/hr/face-requests/" + in2 + "/approve", admin, null, 409);
        call(HttpMethod.POST, "/api/hr/face-requests/" + in2 + "/reject", admin, null, 200);
        assertTrue(today().get("isOpen").asBoolean()); // rejecting changed nothing
    }

    @Test @Order(6)
    void approvingClockOutClosesTheSession() throws Exception {
        long out = submit("OUT");
        call(HttpMethod.POST, "/api/hr/face-requests/" + out + "/approve", admin, null, 200);
        assertFalse(today().get("isOpen").asBoolean());
        long out2 = submit("OUT"); // not clocked in any more
        call(HttpMethod.POST, "/api/hr/face-requests/" + out2 + "/approve", admin, null, 409);
        call(HttpMethod.POST, "/api/hr/face-requests/" + out2 + "/reject", admin, null, 200);
    }

    @Test @Order(7)
    void pendingRequestsPerEmployeeAreLimited() throws Exception {
        submit("IN"); submit("IN"); submit("IN");
        call(HttpMethod.POST, "/api/public/face-request", null, req("R1", "9000000021", "IN", jpeg(2000)), 409);
    }

    @Test @Order(8)
    void guessingIdAndPhoneIsLockedOut() throws Exception {
        call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "R2", "name", "Raj", "email", "raj@example.com", "phone", "9000000022", "password", "password123"), 200);
        for (int i = 0; i < 5; i++) call(HttpMethod.POST, "/api/public/face-request", null, req("R2", "9111111111", "IN", jpeg(2000)), 401);
        call(HttpMethod.POST, "/api/public/face-request", null, req("R2", "9000000022", "IN", jpeg(2000)), 429);
    }
}
