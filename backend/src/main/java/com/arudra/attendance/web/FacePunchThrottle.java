package com.arudra.attendance.web;

import com.arudra.attendance.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The face-only punch has no sign-in, so it limits unrecognised faces per IP: 20 in 5 minutes. Generous enough for a whole
 * office behind one router; tight enough that guessing at faces is pointless. In memory, per backend instance.
 */
@Component
public class FacePunchThrottle {
    private static final int MAX_FAILS = 20;
    private static final long WINDOW_MS = 5 * 60_000L;

    private final Map<String, ArrayDeque<Long>> fails = new ConcurrentHashMap<>();

    private void prune(ArrayDeque<Long> q, long now) {
        while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) q.pollFirst();
    }

    public void check(String ip) {
        ArrayDeque<Long> q = fails.get(ip);
        if (q == null) return;
        synchronized (q) {
            prune(q, System.currentTimeMillis());
            if (q.size() >= MAX_FAILS) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "LOCKED", "Too many unrecognised faces from this network. Try again in a few minutes.");
            }
        }
    }

    public void fail(String ip) {
        ArrayDeque<Long> q = fails.computeIfAbsent(ip, k -> new ArrayDeque<>());
        synchronized (q) {
            long now = System.currentTimeMillis();
            prune(q, now);
            q.addLast(now);
        }
    }
}
