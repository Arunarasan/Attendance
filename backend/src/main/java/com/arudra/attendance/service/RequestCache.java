package com.arudra.attendance.service;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * A cache that exists only while one operation runs on the current thread (for example one payroll preview).
 * Inside {@link #scope}, data that cannot change during the operation (the pay policy, the holiday list, one employee's
 * off-day rules) is read once instead of once per employee. Outside a scope every call goes straight to the loader,
 * so nothing is ever cached across requests and nothing can go stale.
 */
public final class RequestCache {
    private static final ThreadLocal<Map<Object, Object>> CACHE = new ThreadLocal<>();

    private RequestCache() {}

    public static <T> T scope(Supplier<T> body) {
        if (CACHE.get() != null) return body.get(); // already inside a scope
        CACHE.set(new HashMap<>());
        try {
            return body.get();
        } finally {
            CACHE.remove();
        }
    }

    @SuppressWarnings("unchecked")
    public static <T> T get(Object key, Supplier<T> loader) {
        Map<Object, Object> m = CACHE.get();
        if (m == null) return loader.get();
        Object v = m.get(key);
        if (v == null) {
            v = loader.get();
            if (v != null) m.put(key, v);
        }
        return (T) v;
    }
}
