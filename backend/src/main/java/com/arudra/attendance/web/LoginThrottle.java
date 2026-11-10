package com.arudra.attendance.web;

import com.arudra.attendance.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Slows guessing of employee IDs, phone numbers and passwords: five failures lock that ID (from that IP) for 15 minutes.
 * In memory, so with more than one backend instance each keeps its own count.
 */
@Component
public class LoginThrottle {
    private static final int MAX_FAILS = 5;
    private static final long LOCK_MS = 15 * 60_000L;

    private record State(int fails, long lockedUntil) {}

    private final Map<String, State> state = new ConcurrentHashMap<>();

    private static String key(String id, String ip) {
        return (id == null ? "" : id.trim().toLowerCase()) + "|" + ip;
    }

    public void check(String id, String ip) {
        State s = state.get(key(id, ip));
        if (s != null && s.lockedUntil() > System.currentTimeMillis()) {
            long mins = Math.max(1, (s.lockedUntil() - System.currentTimeMillis()) / 60_000L);
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "LOCKED", "Too many failed attempts. Try again in " + mins + " minute(s).");
        }
    }

    public void fail(String id, String ip) {
        state.merge(key(id, ip), new State(1, 0), (old, ignored) -> {
            boolean expired = old.lockedUntil() != 0 && old.lockedUntil() <= System.currentTimeMillis();
            int fails = expired ? 1 : old.fails() + 1;
            return new State(fails, fails >= MAX_FAILS ? System.currentTimeMillis() + LOCK_MS : 0);
        });
    }

    public void ok(String id, String ip) {
        state.remove(key(id, ip));
    }
}
