package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/** Payroll settings HR can change without a deploy: standard hours, weekly off days, overtime rate, default pay mode. */
@Service
public class SettingsService {
    public record Settings(int standardDailyHours, String weeklyOffDays, BigDecimal overtimeMultiplier, String defaultMode) {
        public Set<DayOfWeek> offDays() { return parseDays(weeklyOffDays); }
    }

    private static final long TTL_MS = 10_000;
    private final JdbcClient db;
    private volatile Settings cached;
    private volatile long loadedAt;

    public SettingsService(JdbcClient db) {
        this.db = db;
    }

    /** Cached for a few seconds, so a change reaches every backend instance quickly without a query per punch. */
    public Settings get() {
        Settings s = cached;
        if (s == null || System.currentTimeMillis() - loadedAt > TTL_MS) {
            s = db.sql("SELECT standard_daily_hours, weekly_off_days, overtime_multiplier, default_mode FROM payroll_settings WHERE id = 1")
                    .query(Settings.class).single();
            cached = s;
            loadedAt = System.currentTimeMillis();
        }
        return s;
    }

    public Settings update(Integer standardDailyHours, List<String> weeklyOffDays, BigDecimal overtimeMultiplier, String defaultMode) {
        Settings cur = get();
        int hours = standardDailyHours == null ? cur.standardDailyHours() : standardDailyHours;
        if (hours < 1 || hours > 24) throw ApiException.bad("Standard daily hours must be between 1 and 24");
        BigDecimal mult = overtimeMultiplier == null ? cur.overtimeMultiplier() : overtimeMultiplier;
        if (mult.compareTo(BigDecimal.ONE) < 0 || mult.compareTo(BigDecimal.valueOf(5)) > 0) throw ApiException.bad("Overtime multiplier must be between 1 and 5");
        String mode = defaultMode == null ? cur.defaultMode() : defaultMode;
        if (!"HOURLY".equals(mode) && !"MONTHLY".equals(mode)) throw ApiException.bad("Default mode must be HOURLY or MONTHLY");
        String off = cur.weeklyOffDays();
        if (weeklyOffDays != null) {
            Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
            for (String d : weeklyOffDays) days.add(parseDay(d));
            if (days.size() >= 7) throw ApiException.bad("At least one day a week must be a working day");
            List<String> names = new ArrayList<>();
            for (DayOfWeek d : days) names.add(abbrev(d));
            off = String.join(",", names);
        }
        db.sql("UPDATE payroll_settings SET standard_daily_hours = ?, weekly_off_days = ?, overtime_multiplier = ?, default_mode = ? WHERE id = 1")
                .param(hours).param(off).param(mult).param(mode).update();
        cached = null;
        return get();
    }

    // ---- day names: MON,TUE,... ----

    static String abbrev(DayOfWeek d) { return d.name().substring(0, 3); }

    static DayOfWeek parseDay(String s) {
        if (s == null || s.length() < 3) throw ApiException.bad("Unknown day: " + s);
        String p = s.trim().toUpperCase().substring(0, 3);
        for (DayOfWeek d : DayOfWeek.values()) if (abbrev(d).equals(p)) return d;
        throw ApiException.bad("Unknown day: " + s);
    }

    static Set<DayOfWeek> parseDays(String csv) {
        Set<DayOfWeek> out = EnumSet.noneOf(DayOfWeek.class);
        if (csv == null || csv.isBlank()) return out;
        for (String p : csv.split(",")) out.add(parseDay(p));
        return out;
    }
}
