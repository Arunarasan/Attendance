package com.arudra.attendance.web;

import jakarta.servlet.http.HttpServletResponse;

import java.util.List;

/**
 * Optional paging for the list endpoints that grow with the business (employees, pending approvals, payslips, ...).
 * {@code ?limit=&offset=} choose the slice. With no parameters the first {@value #DEFAULT_LIMIT} rows are returned, so a
 * response can never grow without bound. {@code X-Total-Count} always carries the full count, so a client can tell when
 * the list was cut and ask for the next page. (The slice is taken after the query, so this bounds the response size,
 * not the query cost.)
 */
final class Paging {
    static final int DEFAULT_LIMIT = 1000;
    static final int MAX_LIMIT = 5000;

    private Paging() {}

    static <T> List<T> of(List<T> all, Integer limit, Integer offset, HttpServletResponse res) {
        int lim = limit == null ? DEFAULT_LIMIT : Math.min(Math.max(limit, 1), MAX_LIMIT);
        int off = offset == null ? 0 : Math.max(offset, 0);
        res.setHeader("X-Total-Count", String.valueOf(all.size()));
        res.setHeader("Access-Control-Expose-Headers", "X-Total-Count");
        if (off >= all.size()) return List.of();
        return all.subList(off, Math.min(all.size(), off + lim));
    }
}
