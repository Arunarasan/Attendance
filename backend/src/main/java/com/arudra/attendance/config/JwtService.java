package com.arudra.attendance.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Date;
import javax.crypto.SecretKey;

@Component
public class JwtService {
    private final SecretKey key;
    private final long hours;

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);
    /** The value older versions shipped as a fallback. It is public, so it is never accepted as a signing secret. */
    private static final String RETIRED_DEFAULT = "dev-only-secret-change-me-dev-only-secret-change-me";

    public JwtService(AppProps props) {
        this.key = Keys.hmacShaKeyFor(resolveSecret(props.jwtSecret()));
        this.hours = props.jwtHours();
    }

    /**
     * No built-in default: anyone who has read the source could sign an ADMIN token with it.
     * Unset: a random secret is generated for this run (everyone is signed out on restart, and instances do not share it).
     * Set: it must be at least 32 characters and must not be the retired public value.
     */
    static byte[] resolveSecret(String configured) {
        if (configured == null || configured.isBlank()) {
            byte[] random = new byte[48];
            new SecureRandom().nextBytes(random);
            log.warn("APP_JWT_SECRET is not set. Using a random secret for this run: everyone is signed out on every restart, "
                    + "and several instances cannot share sessions. Set APP_JWT_SECRET (32+ random characters) for production.");
            return random;
        }
        if (RETIRED_DEFAULT.equals(configured)) {
            throw new IllegalStateException("APP_JWT_SECRET is the old public default. Set a private value of 32+ random characters.");
        }
        byte[] bytes = configured.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("APP_JWT_SECRET must be at least 32 characters.");
        }
        return bytes;
    }

    public String issue(long employeeId, String role) {
        long now = System.currentTimeMillis();
        return Jwts.builder().subject(Long.toString(employeeId)).claim("role", role)
                .issuedAt(new Date(now)).expiration(new Date(now + hours * 3_600_000L))
                .signWith(key).compact();
    }

    public Actor parse(String token) {
        try {
            Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            return new Actor(Long.parseLong(c.getSubject()), c.get("role", String.class), null);
        } catch (Exception e) {
            return null;
        }
    }
}
