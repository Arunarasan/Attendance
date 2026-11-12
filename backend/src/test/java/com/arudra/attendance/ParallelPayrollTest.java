package com.arudra.attendance;

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
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression for a race found on MySQL: eight simultaneous "generate payroll" requests for one month created three runs.
 * The database now enforces one run per month; only one request may succeed and the rest get a 409.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:parallelpayroll;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class ParallelPayrollTest {
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;
    @Autowired JdbcClient db;

    @Test
    void simultaneousRunsForOneMonthCreateExactlyOneRun() throws Exception {
        HttpHeaders login = new HttpHeaders();
        login.setContentType(MediaType.APPLICATION_JSON);
        String admin = json.readTree(http.exchange("/api/auth/login", HttpMethod.POST,
                new HttpEntity<>(Map.of("email", "admin@example.com", "password", "ChangeMe123!"), login), String.class).getBody()).get("token").asText();
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setBearerAuth(admin);

        int n = 8;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> fs = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            fs.add(pool.submit(() -> {
                go.await();
                return http.exchange("/api/hr/payroll/generate", HttpMethod.POST, new HttpEntity<>(Map.of("period", "2026-09", "mode", "MONTHLY"), h), String.class).getStatusCode().value();
            }));
        }
        go.countDown();
        List<Integer> codes = new ArrayList<>();
        for (Future<Integer> f : fs) codes.add(f.get(60, TimeUnit.SECONDS));
        pool.shutdown();

        assertEquals(1, codes.stream().filter(c -> c == 200).count(), "exactly one run may succeed: " + codes);
        assertEquals(n - 1, codes.stream().filter(c -> c == 409).count(), "the rest are refused as already generated: " + codes);
        assertEquals(1, db.sql("SELECT COUNT(*) FROM payroll_runs WHERE period = '2026-09'").query(Integer.class).single());
    }
}
