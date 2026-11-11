package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Arrays;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Face and office-network rules for phones. Test requests come from 127.0.0.1 / ::1. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.attendance.on-check-fail=FLAG",
        "app.attendance.phone-face-required=true",
        "spring.datasource.url=jdbc:h2:mem:facenet;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FaceNetworkTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    static String admin, emp;
    static long empId;
    static final String KEY = java.util.Base64.getEncoder().encodeToString(keyBytes());

    static byte[] keyBytes() {
        try {
            var g = java.security.KeyPairGenerator.getInstance("EC");
            g.initialize(256);
            return g.generateKeyPair().getPublic().getEncoded();
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    static double[] face(double v) { double[] d = new double[128]; Arrays.fill(d, v); return d; }

    JsonNode call(HttpMethod m, String url, String bearer, Object body, int expect) throws Exception {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        ResponseEntity<String> r = http.exchange(url, m, new HttpEntity<>(body, h), String.class);
        assertEquals(expect, r.getStatusCode().value(), m + " " + url + " -> " + r.getBody());
        return r.getBody() == null || r.getBody().isBlank() ? null : json.readTree(r.getBody());
    }

    String punch(String action, Map<String, Object> body) throws Exception {
        JsonNode s = call(HttpMethod.POST, "/api/me/punch/" + action, emp, body, 200);
        return s.path("flagReason").asText("");
    }

    @Test @Order(1)
    void setup() throws Exception {
        admin = call(HttpMethod.POST, "/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!"), 200).get("token").asText();
        empId = call(HttpMethod.POST, "/api/hr/employees", admin, Map.of("employeeCode", "F1", "name", "Fay", "email", "fay@example.com", "phone", "9000000001",
                "password", "password123", "deviceBindingMode", "OFF"), 200).get("id").asLong();
        emp = call(HttpMethod.POST, "/api/auth/employee-login", null, Map.of("employeeCode", "F1", "phone", "9000000001", "password", "password123"), 200).get("token").asText();
        call(HttpMethod.POST, "/api/hr/networks", admin, Map.of("name", "Bad", "cidr", "nope"), 400);
        call(HttpMethod.POST, "/api/hr/networks", admin, Map.of("name", "Empty"), 400);
        call(HttpMethod.POST, "/api/hr/networks", admin, Map.of("name", "Head office", "cidr", "10.0.0.0/8"), 200);
        call(HttpMethod.POST, "/api/hr/networks", admin, Map.of("name", "Office AP", "bssid", "AA:BB:CC:DD:EE:FF"), 200);
        assertFalse(call(HttpMethod.GET, "/api/hr/networks/my-ip", admin, null, 200).get("ip").asText().isBlank());
    }

    @Test @Order(2)
    void phoneRegistrationDoesNotNeedAFace() throws Exception {
        // enrol so that punches can be checked, but registering a phone only looks at the network
        call(HttpMethod.POST, "/api/hr/employees/" + empId + "/face", admin, Map.of("descriptors", java.util.List.of(face(0.1))), 200);
        // off the office network (client is 127.0.0.1) -> waits for HR instead of auto-approving
        JsonNode d = call(HttpMethod.POST, "/api/me/devices/bind", emp, Map.of("publicKey", KEY, "label", "p"), 200);
        assertEquals("PENDING", d.get("status").asText());
    }

    @Test @Order(3)
    void punchesAreFlaggedWhenFaceOrNetworkFails() throws Exception {
        // right face, but not on the office network (client is 127.0.0.1)
        String r = punch("in", Map.of("descriptor", face(0.1)));
        assertTrue(r.contains("Not on the office network"), r);
        assertFalse(r.contains("Face"), r);
        punch("out", Map.of());

        r = punch("in", Map.of());
        assertTrue(r.contains("No face check"), r);
        punch("out", Map.of());

        r = punch("in", Map.of("descriptor", face(0.9)));
        assertTrue(r.contains("Face did not match"), r);
        punch("out", Map.of());
    }

    @Test @Order(4)
    void accessPointBssidCountsAsOfficeNetwork() throws Exception {
        String r = punch("in", Map.of("descriptor", face(0.1), "bssid", "aa:bb:cc:dd:ee:ff"));
        assertEquals("", r);
        punch("out", Map.of("descriptor", face(0.1), "bssid", "aa:bb:cc:dd:ee:ff"));
    }

    @Test @Order(5)
    void pairingNeedsOfficeNetworkButNoFace() throws Exception {
        String code = call(HttpMethod.POST, "/api/hr/employees/" + empId + "/app-code", admin, null, 200).get("code").asText();
        // off the IP network and no BSSID: refused, and the refusal does not burn the code
        call(HttpMethod.POST, "/api/public/app/pair", null, Map.of("code", code, "publicKey", KEY, "label", "x"), 403);
        JsonNode ok = call(HttpMethod.POST, "/api/public/app/pair", null, Map.of("code", code, "publicKey", KEY, "label", "x", "bssid", "AA:BB:CC:DD:EE:FF"), 200);
        assertFalse(ok.get("deviceToken").asText().isBlank());
    }

    @Test @Order(6)
    void ipNetworkMatchPassesAndDisablingNetworksSkipsTheCheck() throws Exception {
        call(HttpMethod.POST, "/api/hr/networks", admin, Map.of("name", "Loopback v4", "cidr", "127.0.0.1/32"), 200);
        call(HttpMethod.POST, "/api/hr/networks", admin, Map.of("name", "Loopback v6", "cidr", "::1/128"), 200);
        assertEquals("", punch("in", Map.of("descriptor", face(0.1))));
        punch("out", Map.of("descriptor", face(0.1)));

        for (JsonNode n : call(HttpMethod.GET, "/api/hr/networks", admin, null, 200)) {
            call(HttpMethod.PUT, "/api/hr/networks/" + n.get("id").asLong(), admin, Map.of("active", false), 200);
        }
        assertEquals("", punch("in", Map.of("descriptor", face(0.1)))); // no active networks: nothing to check
    }
}
