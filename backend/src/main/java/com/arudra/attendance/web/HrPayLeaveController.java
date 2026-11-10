package com.arudra.attendance.web;

import com.arudra.attendance.config.Actor;
import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** HR: payroll settings, holidays, leave types and requests, deduction rules. */
@RestController
@RequestMapping("/api/hr")
public class HrPayLeaveController {
    public record SettingsBody(Integer standardDailyHours, List<String> weeklyOffDays, BigDecimal overtimeMultiplier, String defaultMode) {}
    public record HolidayBody(LocalDate date, String name, Boolean paid) {}
    public record LeaveTypeBody(String code, String name, Boolean paid, BigDecimal annualQuota, Boolean active) {}
    public record ApplyLeaveBody(Long employeeId, Long leaveTypeId, LocalDate startDate, LocalDate endDate, Boolean halfDay, String reason) {}

    private final SettingsService settings;
    private final CalendarService calendar;
    private final LeaveService leave;
    private final DeductionService deductions;

    public HrPayLeaveController(SettingsService settings, CalendarService calendar, LeaveService leave, DeductionService deductions) {
        this.settings = settings;
        this.calendar = calendar;
        this.leave = leave;
        this.deductions = deductions;
    }

    // ---- settings ----
    @GetMapping("/settings")
    public Map<String, Object> getSettings() {
        var s = settings.get();
        return Map.of("standardDailyHours", s.standardDailyHours(), "weeklyOffDays", s.offDays().stream().map(Enum::name).sorted().toList(),
                "overtimeMultiplier", s.overtimeMultiplier(), "defaultMode", s.defaultMode());
    }

    @PutMapping("/settings")
    public Map<String, Object> putSettings(@RequestBody SettingsBody b) {
        settings.update(b.standardDailyHours(), b.weeklyOffDays(), b.overtimeMultiplier(), b.defaultMode());
        return getSettings();
    }

    // ---- holidays ----
    @GetMapping("/holidays") public List<M.Holiday> holidays(@RequestParam(required = false) Integer year) { return calendar.holidays(year == null ? LocalDate.now().getYear() : year); }
    @PostMapping("/holidays") public M.Holiday addHoliday(@RequestBody HolidayBody b) { return calendar.addHoliday(b.date(), b.name(), b.paid()); }
    @PutMapping("/holidays/{id}") public Map<String, String> updateHoliday(@PathVariable long id, @RequestBody HolidayBody b) { calendar.updateHoliday(id, b.name(), b.paid()); return Map.of("status", "UPDATED"); }
    @DeleteMapping("/holidays/{id}") public Map<String, String> deleteHoliday(@PathVariable long id) { calendar.deleteHoliday(id); return Map.of("status", "DELETED"); }

    // ---- leave types ----
    @GetMapping("/leave/types") public List<M.LeaveType> leaveTypes() { return leave.types(false); }
    @PostMapping("/leave/types") public Map<String, String> addLeaveType(@RequestBody LeaveTypeBody b) { leave.addType(b.code(), b.name(), b.paid(), b.annualQuota()); return Map.of("status", "CREATED"); }
    @PutMapping("/leave/types/{id}") public Map<String, String> updateLeaveType(@PathVariable long id, @RequestBody LeaveTypeBody b) { leave.updateType(id, b.name(), b.paid(), b.annualQuota(), b.active()); return Map.of("status", "UPDATED"); }

    // ---- leave requests ----
    @GetMapping("/leave/requests")
    public List<M.LeaveRequestView> leaveRequests(@RequestParam(defaultValue = "PENDING") String status) { return leave.byStatus(status.toUpperCase()); }

    @PostMapping("/leave/requests/{id}/approve")
    public Map<String, String> approve(@AuthenticationPrincipal Actor a, @PathVariable long id) { leave.decide(id, true, a.employeeId()); return Map.of("status", "APPROVED"); }

    @PostMapping("/leave/requests/{id}/reject")
    public Map<String, String> reject(@AuthenticationPrincipal Actor a, @PathVariable long id) { leave.decide(id, false, a.employeeId()); return Map.of("status", "REJECTED"); }

    /** HR records leave for someone (for example a phone call in sick): approved at once. */
    @PostMapping("/leave/requests")
    public Map<String, Object> applyForEmployee(@AuthenticationPrincipal Actor a, @RequestBody ApplyLeaveBody b) {
        if (b.employeeId() == null || b.leaveTypeId() == null) throw ApiException.bad("employeeId and leaveTypeId are required");
        long id = leave.request(b.employeeId(), b.leaveTypeId(), b.startDate(), b.endDate(), Boolean.TRUE.equals(b.halfDay()), b.reason(), a.employeeId());
        return Map.of("status", "APPROVED", "id", id);
    }

    @GetMapping("/leave/balances/{employeeId}")
    public List<M.LeaveBalance> balances(@PathVariable long employeeId, @RequestParam(required = false) Integer year) {
        return leave.balances(employeeId, year == null ? LocalDate.now().getYear() : year);
    }

    // ---- deduction rules ----
    @GetMapping("/deductions") public List<M.DeductionRule> deductions() { return deductions.rules(); }
    @PostMapping("/deductions") public Map<String, String> addDeduction(@RequestBody M.DeductionRule r) { deductions.add(r); return Map.of("status", "CREATED"); }
    @PutMapping("/deductions/{id}") public Map<String, String> updateDeduction(@PathVariable long id, @RequestBody M.DeductionRule r) { deductions.update(id, r); return Map.of("status", "UPDATED"); }
    @DeleteMapping("/deductions/{id}") public Map<String, String> deleteDeduction(@PathVariable long id) { deductions.delete(id); return Map.of("status", "DELETED"); }
}
