package com.arudra.attendance.web;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** For load balancers and hosting platforms: 200 when the app can reach its database, 503 when it cannot. No details are exposed. */
@RestController
@RequestMapping("/api/public")
public class HealthController {
    private final JdbcClient db;

    public HealthController(JdbcClient db) {
        this.db = db;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            db.sql("SELECT 1").query(Integer.class).single();
            return ResponseEntity.ok(Map.of("status", "UP"));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Map.of("status", "DOWN"));
        }
    }
}
