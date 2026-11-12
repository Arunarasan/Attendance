package com.arudra.attendance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression for the audit finding "parallel clock-in creates duplicate sessions and HTTP 500".
 * Twelve simultaneous requests for one employee must produce exactly one session and no server error.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.attendance.on-check-fail=FLAG",
        "app.attendance.phone-face-required=false",
        "spring.datasource.url=jdbc:h2:mem:parallelpunch;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class ParallelPunchTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    private ResponseEntity<String> post(String url, String bearer, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) h.setBearerAuth(bearer);
        return http.exchange(url, HttpMethod.POST, new HttpEntity<>(body, h), String.class);
    }

    private List<Integer> fireInParallel(String url, String bearer, Object body, int n) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> futures = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            futures.add(pool.submit(() -> {
                ready.countDown();
                go.await();
                return post(url, bearer, body).getStatusCode().value();
            }));
        }
        ready.await();
        go.countDown();
        List<Integer> codes = new ArrayList<>();
        for (Future<Integer> f : futures) codes.add(f.get(60, TimeUnit.SECONDS));
        pool.shutdown();
        return codes;
    }

    private static long count(List<Integer> codes, int code) {
        return codes.stream().filter(c -> c == code).count();
    }

    @Test
    void simultaneousClockInsCreateExactlyOneSession() throws Exception {
        String admin = json.readTree(post("/api/auth/login", null, Map.of("email", "admin@example.com", "password", "ChangeMe123!")).getBody()).get("token").asText();
        ResponseEntity<String> created = post("/api/hr/employees", admin, Map.of("employeeCode", "P001", "name", "Parallel", "email", "p001@example.com",
                "phone", "9123456780", "password", "password123", "hourlyRate", 100, "baseSalary", 0));
        assertEquals(200, created.getStatusCode().value(), created.getBody());
        String emp = json.readTree(post("/api/auth/employee-login", null, Map.of("employeeCode", "P001", "phone", "9123456780", "password", "password123")).getBody()).get("token").asText();

        Map<String, Object> punch = Map.of("lat", 12.9716, "lng", 77.5946, "accuracy", 10);

        List<Integer> ins = fireInParallel("/api/me/punch/in", emp, punch, 12);
        assertEquals(1, count(ins, 200), "exactly one clock-in may succeed: " + ins);
        assertEquals(11, count(ins, 409), "every other clock-in must be refused as 'already clocked in': " + ins);
        assertEquals(0, ins.stream().filter(c -> c >= 500).count(), "no server errors: " + ins);

        ResponseEntity<String> sheet = http.exchange("/api/me/timesheet?month=" + java.time.YearMonth.now(), HttpMethod.GET,
                new HttpEntity<>(bearer(emp)), String.class);
        JsonNode sessions = json.readTree(sheet.getBody()).get("sessions");
        assertEquals(1, sessions.size(), "one session stored: " + sheet.getBody());

        List<Integer> outs = fireInParallel("/api/me/punch/out", emp, punch, 12);
        assertEquals(1, count(outs, 200), "exactly one clock-out may succeed: " + outs);
        assertEquals(11, count(outs, 409), "every other clock-out must be refused: " + outs);
        assertEquals(0, outs.stream().filter(c -> c >= 500).count(), "no server errors: " + outs);
    }

    private static HttpHeaders bearer(String token) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        return h;
    }
}
