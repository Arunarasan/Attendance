package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.LocalDate;
import java.util.Base64;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.attendance.phone-face-required=false",
        "spring.datasource.url=jdbc:h2:mem:flow;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FlowTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    static String admin;
    static long empId;
    static String empToken;

    JsonNode call(HttpMethod m, String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), "HTTP " + m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    static String sign(KeyPair kp, String data, boolean p1363) throws Exception {
        Signature s = Signature.getInstance(p1363 ? "SHA256withECDSAinP1363Format" : "SHA256withECDSA");
        s.initSign(kp.getPrivate());
        s.update(data.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(s.sign());
    }

    @Test @Order(1)
    void adminLoginAndCreateEmployee() throws Exception {
        admin = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "wrong"), 401);
        call(HttpMethod.GET, "/api/hr/employees", null, null, 401);

        JsonNode e = call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "E001", "name", "Asha", "email", "asha@example.com", "phone", "9876543210",
                "password", "password123", "hourlyRate", 100, "baseSalary", 26000), 200);
        empId = e.get("id").asLong();
        empToken = call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "E001", "phone", "9876543210", "password", "password123"), 200).get("token").asText();
        call(HttpMethod.GET, "/api/hr/employees", empToken, null, 403); // employees cannot reach HR
    }

    @Test @Order(2)
    void geoOutsideFenceIsFlaggedNotBlocked() throws Exception {
        call(HttpMethod.POST, "/api/hr/attendance/locations", admin, Map.of("name", "HQ", "latitude", 12.9716, "longitude", 77.5946, "radiusMeters", 100), 200);
        // ~11 km away
        JsonNode s = call(HttpMethod.POST, "/api/me/punch/in", empToken, Map.of("lat", 13.07, "lng", 77.5946, "accuracy", 20), 200);
        assertTrue(s.get("flagged").asBoolean());
        assertEquals("PENDING", s.get("approvalStatus").asText());
        assertEquals(1, call(HttpMethod.GET, "/api/hr/attendance/pending", admin, null, 200).size());
        call(HttpMethod.POST, "/api/me/punch/in", empToken, Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10), 409); // already in
        long sid = s.get("id").asLong();
        call(HttpMethod.POST, "/api/me/punch/out", empToken, Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10), 200);
        // pending sessions are not paid
        String today = LocalDate.now().toString();
        JsonNode reg = call(HttpMethod.GET, "/api/hr/attendance/register?date=" + today, admin, null, 200);
        assertEquals(0, reg.get(1).path("workedMinutes").asInt());
        call(HttpMethod.POST, "/api/hr/attendance/sessions/" + sid + "/approve", admin, null, 200);
        assertEquals(0, call(HttpMethod.GET, "/api/hr/attendance/pending", admin, null, 200).size());
    }

    @Test @Order(3)
    void hrFixCreatesPaidHoursAndOvertime() throws Exception {
        LocalDate d = LocalDate.now().minusDays(3);
        call(HttpMethod.POST, "/api/hr/attendance/corrections/apply", admin,
                Map.of("employeeId", empId, "date", d.toString(), "checkIn", d + "T09:00:00", "checkOut", d + "T19:00:00"), 200);
        JsonNode ts = call(HttpMethod.GET, "/api/me/timesheet?month=" + java.time.YearMonth.from(d), empToken, null, 200);
        JsonNode day = null;
        for (JsonNode n : ts.get("days")) if (n.get("workDate").asText().equals(d.toString())) day = n;
        assertNotNull(day);
        assertEquals(600, day.get("workedMinutes").asInt());
        assertEquals(120, day.get("overtimeMinutes").asInt()); // beyond 8h
        call(HttpMethod.POST, "/api/hr/attendance/corrections/apply", admin,
                Map.of("employeeId", empId, "date", d.toString(), "checkIn", d + "T19:00:00", "checkOut", d + "T09:00:00"), 400);
    }

    @Test @Order(4)
    void correctionRequestFlow() throws Exception {
        LocalDate d = LocalDate.now().minusDays(5);
        call(HttpMethod.POST, "/api/me/corrections", empToken, Map.of("date", d.toString(), "requestedIn", d + "T09:00:00",
                "requestedOut", d + "T17:00:00", "reason", "Forgot to punch"), 200);
        JsonNode pend = call(HttpMethod.GET, "/api/hr/attendance/corrections", admin, null, 200);
        assertEquals(1, pend.size());
        call(HttpMethod.POST, "/api/hr/attendance/corrections/" + pend.get(0).get("id").asLong() + "/approve", admin, null, 200);
        call(HttpMethod.POST, "/api/hr/attendance/corrections/" + pend.get(0).get("id").asLong() + "/approve", admin, null, 409);
    }

    @Test @Order(5)
    void deviceBindingSignedPunchIsVerifiedAndBadSignatureIsFlagged() throws Exception {
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(256);
        KeyPair kp = g.generateKeyPair();
        call(HttpMethod.POST, "/api/me/devices/bind", empToken, Map.of("publicKey", Base64.getEncoder().encodeToString(kp.getPublic().getEncoded()), "label", "Test phone"), 200);

        String n1 = call(HttpMethod.GET, "/api/nonce", empToken, null, 200).get("nonce").asText();
        JsonNode ok = call(HttpMethod.POST, "/api/me/punch/in", empToken, Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10,
                "nonce", n1, "signature", sign(kp, n1, true)), 200);
        assertFalse(ok.get("flagged").asBoolean(), ok.toString());
        call(HttpMethod.POST, "/api/me/punch/out", empToken, null, 200); // no proof -> soft flag, still allowed

        // replayed nonce is rejected by the challenge check (flagged, not blocked)
        JsonNode replay = call(HttpMethod.POST, "/api/me/punch/in", empToken, Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10,
                "nonce", n1, "signature", sign(kp, n1, false)), 200);
        assertTrue(replay.get("flagged").asBoolean());
        assertTrue(replay.get("flagReason").asText().contains("BAD_CHALLENGE"));
        call(HttpMethod.POST, "/api/me/punch/out", empToken, Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10), 200);
    }

    @Test @Order(6)
    void hardModeRefusesUnprovenPunch() throws Exception {
        call(HttpMethod.PUT, "/api/hr/employees/" + empId, admin, Map.of("deviceBindingMode", "HARD"), 200);
        call(HttpMethod.POST, "/api/me/punch/in", empToken, Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10), 403);
        call(HttpMethod.PUT, "/api/hr/employees/" + empId, admin, Map.of("deviceBindingMode", "SOFT"), 200);
    }

    @Test @Order(7)
    void appPairingIssuesRevocableDeviceToken() throws Exception {
        String code = call(HttpMethod.POST, "/api/hr/employees/" + empId + "/app-code", admin, null, 200).get("code").asText();
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(256);
        KeyPair kp = g.generateKeyPair();
        String pub = Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());
        call(HttpMethod.POST, "/api/public/app/pair", null, Map.of("code", "WRONGCODE", "publicKey", pub, "label", "x"), 400);
        JsonNode paired = call(HttpMethod.POST, "/api/public/app/pair", null, Map.of("code", code, "publicKey", pub, "label", "Pixel"), 200);
        call(HttpMethod.POST, "/api/public/app/pair", null, Map.of("code", code, "publicKey", pub, "label", "Pixel"), 400); // single use
        String dt = paired.get("deviceToken").asText();

        HttpHeaders h = new HttpHeaders();
        h.set("X-Device-Token", dt);
        h.setContentType(MediaType.APPLICATION_JSON);
        String nonce = call(HttpMethod.GET, "/api/nonce", empToken, null, 200).get("nonce").asText();
        ResponseEntity<String> r = http.exchange("/api/me/punch/in", HttpMethod.POST, new HttpEntity<>(
                Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10, "nonce", nonce, "signature", sign(kp, nonce, false)), h), String.class);
        assertEquals(200, r.getStatusCode().value(), r.getBody());
        assertFalse(json.readTree(r.getBody()).get("flagged").asBoolean(), r.getBody());
        http.exchange("/api/me/punch/out", HttpMethod.POST, new HttpEntity<>(Map.of(), h), String.class);

        call(HttpMethod.POST, "/api/hr/employees/" + empId + "/app-revoke", admin, null, 200);
        assertEquals(401, http.exchange("/api/me", HttpMethod.GET, new HttpEntity<>(h), String.class).getStatusCode().value());
    }

    @Test @Order(8)
    void kioskPairingManualPunchAndTooSoon() throws Exception {
        JsonNode k = call(HttpMethod.POST, "/api/hr/kiosks", admin, Map.of("name", "Front desk"), 200);
        String code = k.get("code").asText();
        call(HttpMethod.POST, "/api/public/kiosk/pair", null, Map.of("code", "NOPE1234"), 400);
        String token = call(HttpMethod.POST, "/api/public/kiosk/pair", null, Map.of("code", code), 200).get("token").asText();
        call(HttpMethod.POST, "/api/public/kiosk/pair", null, Map.of("code", code), 400); // single use

        HttpHeaders h = new HttpHeaders();
        h.set("X-Kiosk-Token", token);
        h.setContentType(MediaType.APPLICATION_JSON);
        var res = http.exchange("/api/public/kiosk/punch-manual", HttpMethod.POST, new HttpEntity<>(Map.of("identifier", "E001"), h), String.class);
        JsonNode body = json.readTree(res.getBody());
        assertEquals("CHECKED_IN", body.get("outcome").asText(), res.getBody());
        assertTrue(body.get("flagged").asBoolean()); // no face supplied -> HR must approve
        body = json.readTree(http.exchange("/api/public/kiosk/punch-manual", HttpMethod.POST, new HttpEntity<>(Map.of("identifier", "E001"), h), String.class).getBody());
        assertEquals("TOO_SOON", body.get("outcome").asText());
        body = json.readTree(http.exchange("/api/public/kiosk/punch-manual", HttpMethod.POST, new HttpEntity<>(Map.of("identifier", "NOBODY"), h), String.class).getBody());
        assertEquals("NOT_RECOGNISED", body.get("outcome").asText());
        assertEquals(401, http.exchange("/api/public/kiosk/punch-manual", HttpMethod.POST,
                new HttpEntity<>(Map.of("identifier", "E001"), new HttpHeaders() {{ setContentType(MediaType.APPLICATION_JSON); }}), String.class).getStatusCode().value());
    }

    @Test @Order(9)
    void faceMatchRecognisesEmployeeAndRejectsStranger() throws Exception {
        double[] mine = new double[128];
        java.util.Arrays.fill(mine, 0.1);
        call(HttpMethod.POST, "/api/hr/employees/" + empId + "/face", admin, Map.of("descriptors", java.util.List.of(mine)), 200);
        call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "E002", "name", "Ravi", "email", "ravi@example.com", "phone", "9123456780", "password", "password123"), 200);

        String code = call(HttpMethod.POST, "/api/hr/kiosks", admin, Map.of("name", "Gate"), 200).get("code").asText();
        String token = call(HttpMethod.POST, "/api/public/kiosk/pair", null, Map.of("code", code), 200).get("token").asText();
        HttpHeaders h = new HttpHeaders();
        h.set("X-Kiosk-Token", token);
        h.setContentType(MediaType.APPLICATION_JSON);

        double[] stranger = new double[128];
        java.util.Arrays.fill(stranger, 0.9);
        JsonNode no = json.readTree(http.exchange("/api/public/kiosk/punch", HttpMethod.POST, new HttpEntity<>(Map.of("descriptor", stranger), h), String.class).getBody());
        assertEquals("NOT_RECOGNISED", no.get("outcome").asText());

        // E001 still has the open manual session from the previous test: a close match toggles it, past the min gap rule -> TOO_SOON
        JsonNode yes = json.readTree(http.exchange("/api/public/kiosk/punch", HttpMethod.POST, new HttpEntity<>(Map.of("descriptor", mine), h), String.class).getBody());
        assertEquals("Asha", yes.get("employeeName").asText());
        assertEquals("TOO_SOON", yes.get("outcome").asText());
    }

    @Test @Order(10)
    void payrollGeneratesOncePerPeriod() throws Exception {
        String period = java.time.YearMonth.now().toString();
        JsonNode run = call(HttpMethod.POST, "/api/hr/payroll/generate", admin, Map.of("period", period, "mode", "HOURLY"), 200);
        JsonNode slips = call(HttpMethod.GET, "/api/hr/payroll/runs/" + run.get("runId").asLong() + "/payslips", admin, null, 200);
        assertTrue(slips.size() >= 2);
        call(HttpMethod.POST, "/api/hr/payroll/generate", admin, Map.of("period", period, "mode", "HOURLY"), 409);
        call(HttpMethod.POST, "/api/hr/payroll/generate", admin, Map.of("period", "bad", "mode", "HOURLY"), 400);
        assertTrue(call(HttpMethod.GET, "/api/me/payslips", empToken, null, 200).size() >= 1);
    }
}
