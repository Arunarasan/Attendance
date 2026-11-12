package com.arudra.attendance;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:health;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class HealthTest {
    @Autowired TestRestTemplate http;

    @Test
    void healthIsPublicAndReportsUpWithoutDetails() {
        ResponseEntity<String> r = http.getForEntity("/api/public/health", String.class);
        assertEquals(200, r.getStatusCode().value());
        assertEquals("{\"status\":\"UP\"}", r.getBody());
    }
}
