package com.arudra.attendance.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;

@Component
public class JwtService {
    private final SecretKey key;
    private final long hours;

    public JwtService(AppProps props) {
        this.key = Keys.hmacShaKeyFor(props.jwtSecret().getBytes(StandardCharsets.UTF_8));
        this.hours = props.jwtHours();
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
