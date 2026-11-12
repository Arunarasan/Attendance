package com.arudra.attendance;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Regression for the audit finding SEC-01: with APP_JWT_SECRET unset the app used to sign with a public default,
 * so a token signed with that default was accepted as ADMIN. The app is started here with no secret set.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:jwtforgery;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"})
class JwtForgeryTest {
    @Autowired TestRestTemplate http;

    @Test
    void tokenSignedWithTheOldPublicDefaultIsRejected() {
        String forged = Jwts.builder().subject("1").claim("role", "ADMIN")
                .issuedAt(new Date()).expiration(new Date(System.currentTimeMillis() + 3_600_000L))
                .signWith(Keys.hmacShaKeyFor("dev-only-secret-change-me-dev-only-secret-change-me".getBytes(StandardCharsets.UTF_8)))
                .compact();
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(forged);
        ResponseEntity<String> r = http.exchange("/api/hr/employees", HttpMethod.GET, new HttpEntity<>(h), String.class);
        assertEquals(401, r.getStatusCode().value(), r.getBody());
    }
}
