package com.arudra.attendance.service;

import com.arudra.attendance.config.AppProps;
import com.arudra.attendance.model.M;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** Soft verification: failures flag the session for HR; only HARD device mode refuses (inside DeviceService). */
@Service
public class VerificationService {

    public record PunchInput(Double lat, Double lng, Double accuracy, String nonce, String signature, Long deviceId,
                             double[] descriptor, String bssid, String clientIp) {
        public static PunchInput none() { return new PunchInput(null, null, null, null, null, null, null, null, null); }
    }

    public record Eval(boolean flagged, String reason, String method, Double distance, Long locationId,
                       Boolean deviceVerified, Double lat, Double lng, Double accuracy, Double faceDistance, List<Issue> issues) {}

    /** One failed check: a stable code the apps use to show a fix, and the plain message HR sees. */
    public record Issue(String code, String message) {}

    private static void add(List<String> reasons, List<Issue> issues, String code, String message) {
        reasons.add(message);
        issues.add(new Issue(code, message));
    }

    private final JdbcClient db;
    private final DeviceService devices;
    private final FaceService faces;
    private final NetworkService networks;
    private final AppProps.Attendance cfg;
    private final GeneralSettingsService general;

    public VerificationService(JdbcClient db, DeviceService devices, FaceService faces, NetworkService networks, AppProps props, GeneralSettingsService general) {
        this.general = general;
        this.db = db;
        this.devices = devices;
        this.faces = faces;
        this.networks = networks;
        this.cfg = props.attendance();
    }

    /**
     * Face-only punch (no sign-in, no bound device): the face is already matched by the caller, so only location and the
     * office network are checked here, for every employee. A weak match flags the punch too.
     */
    public Eval evaluateFacePunch(M.Emp emp, PunchInput in, double faceDistance, boolean weakMatch) {
        List<String> reasons = new ArrayList<>();
        List<Issue> issues = new ArrayList<>();
        List<String> methods = new ArrayList<>();
        Double[] geo = new Double[2]; // distance, locationId
        geoCheck(in, reasons, issues, methods, geo);
        networkCheck(in, reasons, issues, methods);
        methods.add("FACE");
        if (weakMatch) add(reasons, issues, "FACE_WEAK", "Weak face match");
        return new Eval(!reasons.isEmpty(), reasons.isEmpty() ? null : String.join("; ", reasons), String.join("+", methods),
                geo[0], geo[1] == null ? null : geo[1].longValue(), null, in.lat(), in.lng(), in.accuracy(), faceDistance, issues);
    }

    private void geoCheck(PunchInput in, List<String> reasons, List<Issue> issues, List<String> methods, Double[] out) {
        List<M.Location> locs = db.sql("SELECT id, name, latitude, longitude, radius_meters, active FROM attendance_locations WHERE active = TRUE")
                .query(M.Location.class).list();
        if (locs.isEmpty()) {
            methods.add("NONE");
        } else if (in.lat() == null || in.lng() == null) {
            methods.add("GEO");
            add(reasons, issues, "LOCATION_MISSING", "No location provided");
        } else {
            methods.add("GEO");
            M.Location nearest = null;
            double best = Double.MAX_VALUE;
            for (M.Location l : locs) {
                double d = haversine(in.lat(), in.lng(), l.latitude(), l.longitude());
                if (d < best) { best = d; nearest = l; }
            }
            out[0] = best;
            out[1] = (double) nearest.id();
            double margin = Math.min(in.accuracy() == null ? 0 : in.accuracy(), general.get().maxAccuracyMarginMeters());
            if (best - margin > nearest.radiusMeters() + general.get().geoGraceMeters()) {
                add(reasons, issues, "LOCATION_OUTSIDE", "Outside " + nearest.name() + " (" + Math.round(best) + " m away)");
            }
        }
    }

    private void networkCheck(PunchInput in, List<String> reasons, List<Issue> issues, List<String> methods) {
        switch (networks.check(in.clientIp(), in.bssid())) {
            case MATCH -> methods.add("WIFI");
            case MISMATCH -> { methods.add("WIFI"); add(reasons, issues, "NETWORK", "Not on the office network"); }
            case NOT_CONFIGURED -> { }
        }
    }

    public Eval evaluate(M.Emp emp, PunchInput in) {
        List<String> reasons = new ArrayList<>();
        List<Issue> issues = new ArrayList<>();
        List<String> methods = new ArrayList<>();
        Double distance = null;
        Long locId = null;
        Double faceDistance = null;

        if (!"OFFICE_DEVICE".equals(emp.attendanceMethod())) {
            // location
            List<M.Location> locs = db.sql("SELECT id, name, latitude, longitude, radius_meters, active FROM attendance_locations WHERE active = TRUE")
                    .query(M.Location.class).list();
            if (locs.isEmpty()) {
                methods.add("NONE");
            } else if (in.lat() == null || in.lng() == null) {
                methods.add("GEO");
                add(reasons, issues, "LOCATION_MISSING", "No location provided");
            } else {
                methods.add("GEO");
                M.Location nearest = null;
                double best = Double.MAX_VALUE;
                for (M.Location l : locs) {
                    double d = haversine(in.lat(), in.lng(), l.latitude(), l.longitude());
                    if (d < best) { best = d; nearest = l; }
                }
                distance = best;
                locId = nearest.id();
                double margin = Math.min(in.accuracy() == null ? 0 : in.accuracy(), general.get().maxAccuracyMarginMeters());
                if (best - margin > nearest.radiusMeters() + general.get().geoGraceMeters()) {
                    add(reasons, issues, "LOCATION_OUTSIDE", "Outside " + nearest.name() + " (" + Math.round(best) + " m away)");
                }
            }

            // office WiFi / network
            switch (networks.check(in.clientIp(), in.bssid())) {
                case MATCH -> methods.add("WIFI");
                case MISMATCH -> { methods.add("WIFI"); add(reasons, issues, "NETWORK", "Not on the office network"); }
                case NOT_CONFIGURED -> { }
            }

            // face
            if (general.get().phoneFaceRequired()) {
                methods.add("FACE");
                if (!faces.hasTemplates(emp.id())) {
                    add(reasons, issues, "FACE_NOT_ENROLLED", "No face enrolled");
                } else if (!FaceService.valid(in.descriptor())) {
                    add(reasons, issues, "FACE_MISSING", "No face check");
                } else {
                    faceDistance = faces.distanceTo(emp.id(), in.descriptor());
                    if (faceDistance == null || faceDistance > cfg.faceWeak()) add(reasons, issues, "FACE_MISMATCH", "Face did not match");
                }
            }
        }

        String mode = emp.deviceBindingMode() != null ? emp.deviceBindingMode()
                : ("OFFICE_DEVICE".equals(emp.attendanceMethod()) ? "OFF" : "SOFT");
        Boolean deviceVerified = null;
        DeviceService.Outcome o = devices.check(emp.id(), mode, in.deviceId(), in.nonce(), in.signature());
        switch (o) {
            case VERIFIED -> { deviceVerified = true; methods.add("DEVICE"); }
            case SKIPPED, NOT_BOUND -> { }
            default -> { deviceVerified = false; methods.add("DEVICE"); add(reasons, issues, "DEVICE", "Phone check failed: " + o); }
        }

        return new Eval(!reasons.isEmpty(), reasons.isEmpty() ? null : String.join("; ", reasons),
                String.join("+", methods), distance, locId, deviceVerified, in.lat(), in.lng(), in.accuracy(), faceDistance, issues);
    }

    static double haversine(double lat1, double lon1, double lat2, double lon2) {
        double r = 6_371_000;
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = p2 - p1, dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * r * Math.asin(Math.sqrt(a));
    }
}
