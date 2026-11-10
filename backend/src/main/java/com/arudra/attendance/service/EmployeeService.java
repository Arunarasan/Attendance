package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

@Service
public class EmployeeService {
    private static final Set<String> ROLES = Set.of("ADMIN", "HR", "EMPLOYEE");
    private static final Set<String> METHODS = Set.of("GEO", "OFFICE_DEVICE", "ANY");
    private static final Set<String> MODES = Set.of("OFF", "SOFT", "HARD");

    public record Input(String employeeCode, String name, String email, String phone, String password, String role,
                        BigDecimal hourlyRate, BigDecimal baseSalary, String attendanceMethod, String deviceBindingMode,
                        Boolean active) {}

    private static final String VIEW = "SELECT id, employee_code, name, email, phone, role, active, hourly_rate, base_salary, attendance_method, device_binding_mode FROM employees";

    private final JdbcClient db;
    private final PasswordEncoder encoder;

    public EmployeeService(JdbcClient db, PasswordEncoder encoder) {
        this.db = db;
        this.encoder = encoder;
    }

    public List<M.EmpView> list() {
        return db.sql(VIEW + " ORDER BY name").query(M.EmpView.class).list();
    }

    public M.EmpView get(long id) {
        return db.sql(VIEW + " WHERE id = ?").param(id).query(M.EmpView.class).optional().orElseThrow(() -> ApiException.notFound("Employee"));
    }

    public M.Emp byEmail(String email) {
        return db.sql("SELECT id, employee_code, name, email, phone, password_hash, role, active, hourly_rate, base_salary, attendance_method, device_binding_mode FROM employees WHERE LOWER(email) = LOWER(?)")
                .param(email == null ? "" : email.trim()).query(M.Emp.class).optional().orElse(null);
    }

    public M.Emp byCode(String code) {
        return db.sql("SELECT id, employee_code, name, email, phone, password_hash, role, active, hourly_rate, base_salary, attendance_method, device_binding_mode FROM employees WHERE LOWER(employee_code) = LOWER(?)")
                .param(code == null ? "" : code.trim()).query(M.Emp.class).optional().orElse(null);
    }

    /** Digits only, so "+91 98765-43210" and "9876543210" compare alike. */
    public static String digits(String s) {
        return s == null ? "" : s.replaceAll("\\D", "");
    }

    /** Compares the last 10 digits, so a country code typed or omitted does not matter. */
    public static boolean samePhone(String a, String b) {
        String x = digits(a), y = digits(b);
        if (x.length() < 7 || y.length() < 7) return false;
        int n = Math.min(10, Math.min(x.length(), y.length()));
        return x.substring(x.length() - n).equals(y.substring(y.length() - n));
    }

    public boolean passwordMatches(M.Emp e, String raw) {
        return raw != null && encoder.matches(raw, e.passwordHash());
    }

    public M.EmpView create(Input in) {
        require(in.employeeCode(), "Employee code");
        require(in.name(), "Name");
        require(in.email(), "Email");
        if (digits(in.phone()).length() < 7) throw ApiException.bad("A phone number is required (it is part of the employee login)");
        assertPhoneFree(in.phone(), null);
        if (in.password() == null || in.password().length() < 8) throw ApiException.bad("Password must be at least 8 characters");
        String role = in.role() == null ? "EMPLOYEE" : in.role();
        String method = in.attendanceMethod() == null ? "GEO" : in.attendanceMethod();
        check(role, ROLES, "role");
        check(method, METHODS, "attendanceMethod");
        if (in.deviceBindingMode() != null) check(in.deviceBindingMode(), MODES, "deviceBindingMode");
        try {
            var kh = new GeneratedKeyHolder();
            db.sql("INSERT INTO employees (employee_code, name, email, phone, password_hash, role, hourly_rate, base_salary, attendance_method, device_binding_mode) VALUES (?,?,?,?,?,?,?,?,?,?)")
                    .param(in.employeeCode().trim()).param(in.name().trim()).param(in.email().trim().toLowerCase()).param(digits(in.phone()))
                    .param(encoder.encode(in.password())).param(role)
                    .param(in.hourlyRate() == null ? BigDecimal.ZERO : in.hourlyRate())
                    .param(in.baseSalary() == null ? BigDecimal.ZERO : in.baseSalary()).param(method).param(in.deviceBindingMode())
                    .update(kh, "id");
            return get(kh.getKey().longValue());
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw ApiException.conflict("Employee code or email already exists");
        }
    }

    public M.EmpView update(long id, Input in) {
        M.EmpView cur = get(id);
        String role = in.role() == null ? cur.role() : in.role();
        String method = in.attendanceMethod() == null ? cur.attendanceMethod() : in.attendanceMethod();
        check(role, ROLES, "role");
        check(method, METHODS, "attendanceMethod");
        if (in.deviceBindingMode() != null) check(in.deviceBindingMode(), MODES, "deviceBindingMode");
        String phone = cur.phone();
        if (in.phone() != null && !in.phone().isBlank()) {
            if (digits(in.phone()).length() < 7) throw ApiException.bad("Invalid phone number");
            assertPhoneFree(in.phone(), id);
            phone = digits(in.phone());
        }
        db.sql("UPDATE employees SET name = ?, phone = ?, role = ?, hourly_rate = ?, base_salary = ?, attendance_method = ?, device_binding_mode = ?, active = ? WHERE id = ?")
                .param(in.name() == null ? cur.name() : in.name().trim()).param(phone)
                .param(role).param(in.hourlyRate() == null ? cur.hourlyRate() : in.hourlyRate())
                .param(in.baseSalary() == null ? cur.baseSalary() : in.baseSalary()).param(method)
                .param(in.deviceBindingMode() == null ? cur.deviceBindingMode() : in.deviceBindingMode())
                .param(in.active() == null ? cur.active() : in.active()).param(id).update();
        if (in.password() != null && !in.password().isBlank()) {
            if (in.password().length() < 8) throw ApiException.bad("Password must be at least 8 characters");
            db.sql("UPDATE employees SET password_hash = ? WHERE id = ?").param(encoder.encode(in.password())).param(id).update();
        }
        return get(id);
    }

    public List<M.RegisterRow> register(LocalDate date) {
        return db.sql("""
                SELECT e.id AS employee_id, e.name AS employee_name, e.employee_code, a.check_in, a.check_out,
                       a.worked_minutes, a.overtime_minutes,
                       (SELECT t.code FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
                         WHERE r.employee_id = e.id AND r.status = 'APPROVED' AND ? BETWEEN r.start_date AND r.end_date LIMIT 1) AS leave_type,
                       (SELECT h.name FROM holidays h WHERE h.holiday_date = ?) AS holiday
                FROM employees e LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date = ?
                WHERE e.active = TRUE ORDER BY e.name""").param(date).param(date).param(date).query(M.RegisterRow.class).list();
    }

    private void assertPhoneFree(String phone, Long exceptId) {
        for (M.EmpView e : list()) {
            if ((exceptId == null || e.id() != exceptId) && samePhone(e.phone(), phone)) {
                throw ApiException.conflict("That phone number already belongs to " + e.name());
            }
        }
    }

    private static void require(String v, String what) {
        if (v == null || v.isBlank()) throw ApiException.bad(what + " is required");
    }

    private static void check(String v, Set<String> allowed, String field) {
        if (!allowed.contains(v)) throw ApiException.bad(field + " must be one of " + allowed);
    }
}
