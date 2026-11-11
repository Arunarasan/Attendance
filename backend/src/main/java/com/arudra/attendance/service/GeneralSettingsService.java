package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.config.AppProps;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

/** Company profile and punch rules HR can change without a deploy. Cached for a few seconds. */
@Service
public class GeneralSettingsService {
    public record General(String companyName, String legalName, String companyAddress, String addressLine2, String city, String state, String pincode,
                          String companyPhone, String companyEmail, String website, String gstin, String pan, String defaultLanguage,
                          int geoGraceMeters, int maxAccuracyMarginMeters, int kioskMinGapSeconds, boolean phoneFaceRequired, String onCheckFail) {}

    public record Input(String companyName, String legalName, String companyAddress, String addressLine2, String city, String state, String pincode,
                        String companyPhone, String companyEmail, String website, String gstin, String pan, String defaultLanguage,
                        Integer geoGraceMeters, Integer maxAccuracyMarginMeters, Integer kioskMinGapSeconds, Boolean phoneFaceRequired, String onCheckFail) {}

    private static final Pattern EMAIL = Pattern.compile("^[^@ ]+@[^@ ]+[.][^@ ]+$");
    private static final Pattern GSTIN = Pattern.compile("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$");
    private static final Pattern PAN = Pattern.compile("^[A-Z]{5}[0-9]{4}[A-Z]$");
    private static final Pattern PIN = Pattern.compile("^[0-9]{6}$");

    private static final long TTL_MS = 10_000;
    private final JdbcClient db;
    private final AppProps.Attendance cfg;
    private volatile General cached;
    private volatile long loadedAt;

    public GeneralSettingsService(JdbcClient db, AppProps props) {
        this.db = db;
        this.cfg = props.attendance();
    }

    public General get() {
        General g = cached;
        if (g == null || System.currentTimeMillis() - loadedAt > TTL_MS) {
            g = db.sql("SELECT company_name, legal_name, company_address, address_line2, city, state, pincode, company_phone, company_email, website, gstin, pan, default_language, "
                            + "COALESCE(geo_grace_meters, ?) AS geo_grace_meters, COALESCE(max_accuracy_margin_meters, ?) AS max_accuracy_margin_meters, "
                            + "COALESCE(kiosk_min_gap_seconds, ?) AS kiosk_min_gap_seconds, COALESCE(phone_face_required, ?) AS phone_face_required, COALESCE(on_check_fail, ?) AS on_check_fail FROM general_settings WHERE id = 1")
                    .param(cfg.geoGraceMeters()).param(cfg.maxAccuracyMarginMeters()).param(cfg.kioskMinGapSeconds()).param(cfg.phoneFaceRequired()).param(cfg.onCheckFail() == null || cfg.onCheckFail().isBlank() ? "ASK" : cfg.onCheckFail())
                    .query(General.class).single();
            cached = g;
            loadedAt = System.currentTimeMillis();
        }
        return g;
    }

    public General update(Input in) {
        General c = get();
        String name = text(in.companyName(), c.companyName(), 120, "Company name");
        if (name.isEmpty()) throw ApiException.bad("Company name is required");
        String legal = text(in.legalName(), c.legalName(), 160, "Legal name");
        String line1 = text(in.companyAddress(), c.companyAddress(), 200, "Address line 1");
        String line2 = text(in.addressLine2(), c.addressLine2(), 200, "Address line 2");
        String city = text(in.city(), c.city(), 80, "City");
        String state = text(in.state(), c.state(), 80, "State");
        String pin = text(in.pincode(), c.pincode(), 10, "PIN code");
        if (!pin.isEmpty() && !PIN.matcher(pin).matches()) throw ApiException.bad("PIN code must be 6 digits");
        String phone = text(in.companyPhone(), c.companyPhone(), 30, "Phone");
        if (!phone.isEmpty() && phone.replaceAll("[^0-9]", "").length() < 7) throw ApiException.bad("Enter a valid company phone number");
        String email = text(in.companyEmail(), c.companyEmail(), 120, "Email");
        if (!email.isEmpty() && !EMAIL.matcher(email).matches()) throw ApiException.bad("Enter a valid company email");
        String web = text(in.website(), c.website(), 150, "Website");
        String gstin = text(in.gstin(), c.gstin(), 15, "GSTIN").toUpperCase();
        if (!gstin.isEmpty() && !GSTIN.matcher(gstin).matches()) throw ApiException.bad("GSTIN must be 15 characters, like 33ABCDE1234F1Z5");
        String pan = text(in.pan(), c.pan(), 10, "PAN").toUpperCase();
        if (!pan.isEmpty() && !PAN.matcher(pan).matches()) throw ApiException.bad("PAN must be 10 characters, like ABCDE1234F");
        String lang = in.defaultLanguage() == null ? c.defaultLanguage() : in.defaultLanguage().trim().toLowerCase();
        if (!lang.equals("en") && !lang.equals("ta") && !lang.equals("hi")) throw ApiException.bad("Language must be English, Tamil or Hindi");
        int grace = in.geoGraceMeters() == null ? c.geoGraceMeters() : in.geoGraceMeters();
        if (grace < 0 || grace > 1000) throw ApiException.bad("Location grace must be between 0 and 1000 metres");
        int acc = in.maxAccuracyMarginMeters() == null ? c.maxAccuracyMarginMeters() : in.maxAccuracyMarginMeters();
        if (acc < 0 || acc > 2000) throw ApiException.bad("GPS accuracy allowance must be between 0 and 2000 metres");
        int gap = in.kioskMinGapSeconds() == null ? c.kioskMinGapSeconds() : in.kioskMinGapSeconds();
        if (gap < 0 || gap > 3600) throw ApiException.bad("Minimum gap between punches must be between 0 and 3600 seconds");
        boolean face = in.phoneFaceRequired() == null ? c.phoneFaceRequired() : in.phoneFaceRequired();
        String onFail = in.onCheckFail() == null ? c.onCheckFail() : in.onCheckFail().trim().toUpperCase();
        if (!onFail.equals("ASK") && !onFail.equals("BLOCK") && !onFail.equals("FLAG")) throw ApiException.bad("When a check fails must be ASK, BLOCK or FLAG");
        db.sql("UPDATE general_settings SET company_name = ?, legal_name = ?, company_address = ?, address_line2 = ?, city = ?, state = ?, pincode = ?, company_phone = ?, company_email = ?, website = ?, gstin = ?, pan = ?, default_language = ?, "
                        + "geo_grace_meters = ?, max_accuracy_margin_meters = ?, kiosk_min_gap_seconds = ?, phone_face_required = ?, on_check_fail = ? WHERE id = 1")
                .param(name).param(legal).param(line1).param(line2).param(city).param(state).param(pin).param(phone).param(email).param(web).param(gstin).param(pan).param(lang)
                .param(grace).param(acc).param(gap).param(face).param(onFail).update();
        cached = null;
        return get();
    }

    private static String text(String in, String cur, int max, String what) {
        String t = (in == null ? cur : in).trim();
        if (t.length() > max) throw ApiException.bad(what + " is too long (at most " + max + " characters)");
        return t;
    }
}
