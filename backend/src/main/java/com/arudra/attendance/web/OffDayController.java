package com.arudra.attendance.web;

import com.arudra.attendance.config.Actor;
import com.arudra.attendance.service.OffDayService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Weekly off days: HR assigns them and decides employees' requests; employees see theirs and ask for a change (HR must approve). */
@RestController
@RequestMapping("/api")
public class OffDayController {
    public record AssignBody(List<String> days, LocalDate validFrom) {}
    public record OffRequest(List<String> days, LocalDate effectiveFrom, String reason) {}
    public record DecisionBody(String note) {}

    private final OffDayService offDays;

    public OffDayController(OffDayService offDays) {
        this.offDays = offDays;
    }

    // ---- HR ----

    @GetMapping("/hr/employees/{id}/off-days")
    public Map<String, Object> employeeOffDays(@PathVariable long id) {
        return Map.of("current", offDays.current(id), "rules", offDays.rules(id), "requests", offDays.mine(id));
    }

    /** days = null (or omitted) puts the employee back on the company default. */
    @PutMapping("/hr/employees/{id}/off-days")
    public Map<String, Object> assign(@AuthenticationPrincipal Actor a, @PathVariable long id, @RequestBody AssignBody b) {
        offDays.assign(id, b.days(), b.validFrom(), a.employeeId());
        return Map.of("current", offDays.current(id));
    }

    @GetMapping("/hr/off-day-requests")
    public List<OffDayService.Request> requests(@RequestParam(defaultValue = "PENDING") String status) { return offDays.byStatus(status.toUpperCase()); }

    @PostMapping("/hr/off-day-requests/{id}/approve")
    public Map<String, String> approve(@AuthenticationPrincipal Actor a, @PathVariable long id, @RequestBody(required = false) DecisionBody b) {
        offDays.decide(id, true, b == null ? null : b.note(), a.employeeId());
        return Map.of("status", "APPROVED");
    }

    @PostMapping("/hr/off-day-requests/{id}/reject")
    public Map<String, String> reject(@AuthenticationPrincipal Actor a, @PathVariable long id, @RequestBody(required = false) DecisionBody b) {
        offDays.decide(id, false, b == null ? null : b.note(), a.employeeId());
        return Map.of("status", "REJECTED");
    }

    // ---- the employee ----

    @GetMapping("/me/off-days")
    public Map<String, Object> mine(@AuthenticationPrincipal Actor a) {
        return Map.of("current", offDays.current(a.employeeId()), "requests", offDays.mine(a.employeeId()),
                "maxDays", OffDayService.MAX_OFF_DAYS, "cooldownDays", OffDayService.COOLDOWN_DAYS);
    }

    @PostMapping("/me/off-days/request")
    public Map<String, Object> request(@AuthenticationPrincipal Actor a, @RequestBody OffRequest b) {
        long id = offDays.request(a.employeeId(), b.days(), b.effectiveFrom(), b.reason());
        return Map.of("id", id, "status", "PENDING");
    }

    @PostMapping("/me/off-days/requests/{id}/cancel")
    public Map<String, String> cancel(@AuthenticationPrincipal Actor a, @PathVariable long id) {
        offDays.cancel(a.employeeId(), id);
        return Map.of("status", "CANCELLED");
    }
}
