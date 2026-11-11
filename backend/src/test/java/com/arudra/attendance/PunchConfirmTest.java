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

/** A failed check does nothing until the employee chooses: nothing is recorded or shown to HR unless they agree to send it. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.attendance.phone-face-required=false",
        "app.attendance.kiosk-min-gap-seconds=0",
        "spring.datasource.url=jdbc:h2:mem:confirm;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PunchConfirmTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    static String admin;
    static String emp;
    static final Map<String, Object> FAR = Map.of("lat", 13.07, "lng", 77.5946, "accuracy", 20);     // ~11 km from HQ
    static final Map<String, Object> HOME = Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10);   // at HQ

    JsonNode call(HttpMethod m, String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    static Map<String, Object> with(Map<String, Object> base, Object... kv) {
        var m = new java.util.HashMap<>(base);
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    int pendingForHr() throws Exception { return call(HttpMethod.GET, "/api/hr/attendance/pending", admin, null, 200).size(); }

    void setMode(String mode) throws Exception { call(HttpMethod.PUT, "/api/hr/general-settings", admin, Map.of("onCheckFail", mode), 200); Thread.sleep(0); }

    @Test @Order(1)
    void setUp() throws Exception {
        admin = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "E1", "name", "Asha", "email", "asha@example.com", "phone", "9876543210", "password", "password123", "hourlyRate", 100, "baseSalary", 26000), 200);
        emp = call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "E1", "password", "password123"), 200).get("token").asText();
        call(HttpMethod.POST, "/api/hr/attendance/locations", admin, Map.of("name", "HQ", "latitude", 12.9716, "longitude", 77.5946, "radiusMeters", 100), 200);
        assertEquals("ASK", call(HttpMethod.GET, "/api/hr/general-settings", admin, null, 200).get("onCheckFail").asText(), "the default is to let the employee choose");
    }

    @Test @Order(2)
    void failedCheckIsNotRecordedUntilTheEmployeeAgrees() throws Exception {
        JsonNode r = call(HttpMethod.POST, "/api/me/punch/in", emp, FAR, 422);
        assertEquals("NEEDS_CONFIRMATION", r.get("code").asText());
        assertEquals("LOCATION_OUTSIDE", r.get("issues").get(0).get("code").asText());
        assertEquals(0, call(HttpMethod.GET, "/api/me/today", emp, null, 200).get("sessions").size(), "nothing recorded");
        assertEquals(0, pendingForHr(), "nothing shown to HR");
    }

    @Test @Order(3)
    void fixingTheProblemAndTryingAgainRecordsACleanPunchHrNeverSees() throws Exception {
        JsonNode s = call(HttpMethod.POST, "/api/me/punch/in", emp, HOME, 200);
        assertFalse(s.get("flagged").asBoolean());
        assertEquals("APPROVED", s.get("approvalStatus").asText());
        assertEquals(0, pendingForHr());
        call(HttpMethod.POST, "/api/me/punch/out", emp, HOME, 200);
    }

    @Test @Order(4)
    void agreeingNeedsANoteThenReachesHrWithIt() throws Exception {
        call(HttpMethod.POST, "/api/me/punch/in", emp, with(FAR, "confirm", true), 400);                         // no note
        call(HttpMethod.POST, "/api/me/punch/in", emp, with(FAR, "confirm", true, "note", "   "), 400);          // blank note
        assertEquals(0, call(HttpMethod.GET, "/api/me/today", emp, null, 200).get("sessions").size() - 1, "only the earlier clean session exists");
        JsonNode s = call(HttpMethod.POST, "/api/me/punch/in", emp, with(FAR, "confirm", true, "note", "Visiting a client site"), 200);
        assertTrue(s.get("flagged").asBoolean());
        assertEquals("PENDING", s.get("approvalStatus").asText());
        assertEquals("Visiting a client site", s.get("employeeNote").asText());
        JsonNode pending = call(HttpMethod.GET, "/api/hr/attendance/pending", admin, null, 200);
        assertEquals(1, pending.size());
        assertEquals("Visiting a client site", pending.get(0).get("employeeNote").asText());
        assertTrue(pending.get(0).get("flagReason").asText().contains("Outside HQ"));
    }

    @Test @Order(5)
    void checkOutAsksTheSameWay() throws Exception {
        JsonNode r = call(HttpMethod.POST, "/api/me/punch/out", emp, FAR, 422);
        assertEquals("NEEDS_CONFIRMATION", r.get("code").asText());
        JsonNode s = call(HttpMethod.POST, "/api/me/punch/out", emp, with(FAR, "confirm", true, "note", "Left from the site"), 200);
        assertNotNull(s.get("clockOut").asText());
        assertEquals("Visiting a client site; Left from the site", s.get("employeeNote").asText());
    }

    @Test @Order(6)
    void blockModeRefusesAndRecordsNothing() throws Exception {
        setMode("BLOCK");
        int before = call(HttpMethod.GET, "/api/me/today", emp, null, 200).get("sessions").size();
        JsonNode r = call(HttpMethod.POST, "/api/me/punch/in", emp, with(FAR, "confirm", true, "note", "please"), 422);
        assertEquals("PUNCH_BLOCKED", r.get("code").asText());
        assertEquals(before, call(HttpMethod.GET, "/api/me/today", emp, null, 200).get("sessions").size());
    }

    @Test @Order(7)
    void flagModeKeepsTheOldRecordAndFlagBehaviour() throws Exception {
        setMode("FLAG");
        JsonNode s = call(HttpMethod.POST, "/api/me/punch/in", emp, FAR, 200);
        assertTrue(s.get("flagged").asBoolean());
        assertEquals("PENDING", s.get("approvalStatus").asText());
        call(HttpMethod.POST, "/api/me/punch/out", emp, HOME, 200);
    }

    @Test @Order(8)
    void invalidSettingIsRejected() throws Exception {
        call(HttpMethod.PUT, "/api/hr/general-settings", admin, Map.of("onCheckFail", "SOMETIMES"), 400);
    }
    // a tiny JPEG-looking payload: the server checks the JPEG signature, not the pixels
    static final String JPEG = "data:image/jpeg;base64," + java.util.Base64.getEncoder().encodeToString(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3, 4});

    @Test @Order(9)
    void aPunchSentToHrKeepsTheCameraFrameForHrToCheck() throws Exception {
        setMode("ASK");
        JsonNode s = call(HttpMethod.POST, "/api/me/punch/in", emp, with(FAR, "confirm", true, "note", "Client site", "photo", JPEG), 200);
        long id = s.get("id").asLong();
        JsonNode p = null;
        for (JsonNode x : call(HttpMethod.GET, "/api/hr/attendance/pending", admin, null, 200)) if (x.get("id").asLong() == id) p = x;
        assertNotNull(p);
        assertTrue(p.get("hasPhotoIn").asBoolean());
        assertFalse(p.get("hasPhotoOut").asBoolean());
        HttpHeaders h = new HttpHeaders(); h.setBearerAuth(admin);
        ResponseEntity<byte[]> img = http.exchange("/api/hr/attendance/sessions/" + id + "/photo?kind=IN", HttpMethod.GET, new HttpEntity<>(h), byte[].class);
        assertEquals(200, img.getStatusCode().value());
        assertEquals((byte) 0xFF, img.getBody()[0]);
        // employees cannot read it
        HttpHeaders eh = new HttpHeaders(); eh.setBearerAuth(emp);
        assertEquals(403, http.exchange("/api/hr/attendance/sessions/" + id + "/photo?kind=IN", HttpMethod.GET, new HttpEntity<>(eh), String.class).getStatusCode().value());
        call(HttpMethod.POST, "/api/me/punch/out", emp, HOME, 200);
    }

    @Test @Order(10)
    void aBadPhotoRefusesTheWholePunchAndRecordsNothing() throws Exception {
        int before = call(HttpMethod.GET, "/api/me/today", emp, null, 200).get("sessions").size();
        call(HttpMethod.POST, "/api/me/punch/in", emp, with(FAR, "confirm", true, "note", "x", "photo", "data:image/png;base64,AAAA"), 400);
        assertEquals(before, call(HttpMethod.GET, "/api/me/today", emp, null, 200).get("sessions").size());
    }
}
