package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.config.AppProps;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/** Face templates (128-number descriptors) and Euclidean matching, shared by the kiosk, phone punches and registration. */
@Service
public class FaceService {
    /** Enrolled plus learned templates kept per employee. */
    static final int MAX_TEMPLATES = 14;
    /** A match closer than this to an existing template adds nothing new, so it is not learned. */
    static final double MIN_NOVELTY = 0.12;

    private final JdbcClient db;
    private final AppProps.Attendance cfg;

    public FaceService(JdbcClient db, AppProps props) {
        this.db = db;
        this.cfg = props.attendance();
    }

    /**
     * Remember a new look (other light, angle, glasses) after a confident, unflagged punch. Only faces that already match
     * well are added, and the oldest learned one is replaced when full; enrolled templates are never replaced.
     */
    @Transactional
    public void learn(long employeeId, double[] descriptor) {
        if (cfg.faceLearn() <= 0 || !valid(descriptor)) return;
        Double nearest = distanceTo(employeeId, descriptor);
        if (nearest == null || nearest > cfg.faceLearn() || nearest < MIN_NOVELTY) return;
        int total = db.sql("SELECT COUNT(*) FROM employee_face_templates WHERE employee_id = ?").param(employeeId).query(Integer.class).single();
        if (total >= MAX_TEMPLATES) {
            Long oldest = db.sql("SELECT id FROM employee_face_templates WHERE employee_id = ? AND auto_learned = TRUE ORDER BY id LIMIT 1")
                    .param(employeeId).query(Long.class).optional().orElse(null);
            if (oldest == null) return;
            db.sql("DELETE FROM employee_face_templates WHERE id = ?").param(oldest).update();
        }
        db.sql("INSERT INTO employee_face_templates (employee_id, descriptor, auto_learned) VALUES (?,?,TRUE)")
                .param(employeeId).param(Arrays.toString(descriptor)).update();
    }

    public static boolean valid(double[] d) {
        return d != null && d.length == 128;
    }

    public boolean hasTemplates(long employeeId) {
        return db.sql("SELECT COUNT(*) FROM employee_face_templates WHERE employee_id = ?").param(employeeId).query(Integer.class).single() > 0;
    }

    /** Smallest distance to this employee's templates, or null when none are enrolled. */
    public Double distanceTo(long employeeId, double[] descriptor) {
        Double best = null;
        for (String t : db.sql("SELECT descriptor FROM employee_face_templates WHERE employee_id = ?").param(employeeId).query(String.class).list()) {
            double d = distance(descriptor, parse(t));
            best = best == null ? d : Math.min(best, d);
        }
        return best;
    }

    /** Best distance per enrolled employee, for 1:N identification. */
    public Map<Long, Double> bestPerEmployee(double[] descriptor) {
        Map<Long, Double> best = new HashMap<>();
        db.sql("SELECT employee_id, descriptor FROM employee_face_templates").query((rs, i) -> {
            best.merge(rs.getLong("employee_id"), distance(descriptor, parse(rs.getString("descriptor"))), Math::min);
            return null;
        }).list();
        return best;
    }

    /** Employee enrols their own face the first time. Changing it later needs HR (so nobody can swap in someone else). */
    @Transactional
    public void enrolOnce(long employeeId, List<double[]> descriptors) {
        if (hasTemplates(employeeId)) {
            throw ApiException.conflict("Your face is already enrolled. Ask HR to reset it if it needs changing.");
        }
        enrol(employeeId, descriptors);
    }

    @Transactional
    public void enrol(long employeeId, List<double[]> descriptors) {
        if (descriptors == null || descriptors.isEmpty()) throw ApiException.bad("No face descriptors");
        if (descriptors.size() > 20) throw ApiException.bad("At most 20 face shots");
        for (double[] d : descriptors) if (!valid(d)) throw ApiException.bad("Each descriptor needs 128 numbers");
        db.sql("DELETE FROM employee_face_templates WHERE employee_id = ?").param(employeeId).update();
        for (double[] d : descriptors) {
            db.sql("INSERT INTO employee_face_templates (employee_id, descriptor) VALUES (?,?)").param(employeeId).param(Arrays.toString(d)).update();
        }
    }

    static double[] parse(String s) {
        String[] parts = s.replace("[", "").replace("]", "").split(",");
        double[] d = new double[parts.length];
        for (int i = 0; i < parts.length; i++) d[i] = Double.parseDouble(parts[i].trim());
        return d;
    }

    static double distance(double[] a, double[] b) {
        if (a.length != b.length) return Double.MAX_VALUE;
        double sum = 0;
        for (int i = 0; i < a.length; i++) sum += (a[i] - b[i]) * (a[i] - b[i]);
        return Math.sqrt(sum);
    }
}
