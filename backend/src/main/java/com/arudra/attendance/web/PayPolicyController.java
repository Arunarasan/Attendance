package com.arudra.attendance.web;

import com.arudra.attendance.config.Actor;
import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.DayRulesService;
import com.arudra.attendance.service.PayrollService;
import com.arudra.attendance.service.PolicyService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** HR: pay policy, per-employee pay settings, daily loss-of-pay review, honour scores and payroll preview. */
@RestController
@RequestMapping("/api/hr")
public class PayPolicyController {
    public record EmpPayBody(String payMode, BigDecimal allowances, Boolean otEligible) {}
    public record OverrideBody(Long employeeId, LocalDate date, BigDecimal lopDays, String reason) {}
    public record PreviewBody(String period, String mode) {}

    private final PolicyService policies;
    private final DayRulesService days;
    private final PayrollService payroll;
    private final JdbcClient db;

    public PayPolicyController(PolicyService policies, DayRulesService days, PayrollService payroll, JdbcClient db) {
        this.policies = policies;
        this.days = days;
        this.payroll = payroll;
        this.db = db;
    }

    @GetMapping("/policy") public PolicyService.Policy policy() { return policies.get(); }
    @PutMapping("/policy") public PolicyService.Policy updatePolicy(@RequestBody PolicyService.Policy p) { return policies.update(p); }

    @GetMapping("/employees/{id}/pay") public PolicyService.EmpPay empPay(@PathVariable long id) { return policies.empPay(id); }
    @PutMapping("/employees/{id}/pay")
    public PolicyService.EmpPay setEmpPay(@PathVariable long id, @RequestBody EmpPayBody b) { return policies.setEmpPay(id, b.payMode(), b.allowances(), b.otEligible()); }

    @PostMapping("/payroll/preview") public List<PayrollService.Line> preview(@RequestBody PreviewBody b) { return payroll.preview(b.period(), b.mode()); }

    /** One employee's month, day by day, with the loss of pay each day carries and any HR override reason. */
    @GetMapping("/attendance/day-status")
    public Map<String, Object> dayStatus(@RequestParam long employeeId, @RequestParam String month) {
        YearMonth ym = parse(month);
        DayRulesService.Month m = days.month(employeeId, ym);
        Map<LocalDate, String> reasons = days.overrideReasons(employeeId, ym);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (DayRulesService.Day d : m.days()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("date", d.date()); r.put("status", d.status()); r.put("workedMinutes", d.workedMinutes()); r.put("lateMinutes", d.lateMinutes());
            r.put("shortMinutes", d.shortMinutes()); r.put("lop", d.lop()); r.put("overridden", d.overridden()); r.put("reason", reasons.get(d.date()));
            rows.add(r);
        }
        return Map.of("days", rows, "lopDays", m.lopDays(), "lateLop", m.lateLop(), "lateDays", m.lateDays());
    }

    @PutMapping("/attendance/lop-override")
    public Map<String, String> override(@AuthenticationPrincipal Actor a, @RequestBody OverrideBody b) {
        if (b.employeeId() == null) throw ApiException.bad("employeeId is required");
        days.setOverride(b.employeeId(), b.date(), b.lopDays(), b.reason(), a.employeeId());
        return Map.of("status", "SAVED");
    }

    @GetMapping("/scores")
    public List<Map<String, Object>> scores(@RequestParam String month) {
        YearMonth ym = parse(month);
        List<Map<String, Object>> out = new ArrayList<>();
        for (M.Emp e : db.sql("SELECT id, employee_code, name, email, phone, password_hash, role, active, hourly_rate, base_salary, attendance_method, device_binding_mode FROM employees WHERE active = TRUE ORDER BY name")
                .query(M.Emp.class).list()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("employeeId", e.id()); r.put("employeeName", e.name()); r.put("employeeCode", e.employeeCode()); r.put("score", days.score(e.id(), ym));
            out.add(r);
        }
        return out;
    }

    static YearMonth parse(String month) {
        try { return YearMonth.parse(month); } catch (Exception e) { throw ApiException.bad("month must look like 2026-10"); }
    }
}
