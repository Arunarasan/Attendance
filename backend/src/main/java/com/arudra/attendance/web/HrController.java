package com.arudra.attendance.web;

import com.arudra.attendance.config.Actor;
import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/hr")
public class HrController {
    public record LocationBody(String name, Double latitude, Double longitude, Integer radiusMeters, Boolean active) {}
    public record IdsBody(List<Long> ids) {}
    public record ApplyDate(Long employeeId, LocalDate date, LocalDateTime checkIn, LocalDateTime checkOut) {}
    public record ApplySession(Long sessionId, LocalDateTime checkIn, LocalDateTime checkOut) {}
    public record KioskBody(String name, String verifyMode) {}
    public record FaceBody(List<double[]> descriptors) {}
    public record PayrollBody(String period, String mode) {}
    public record AdjustBody(BigDecimal amount) {}

    private final EmployeeService employees;
    private final TimeService time;
    private final CorrectionService corrections;
    private final DeviceService devices;
    private final KioskService kiosks;
    private final AppPairingService pairing;
    private final PayrollService payroll;
    private final JdbcClient db;
    private final NetworkService networks;
    private final FaceRequestService faceRequests;
    private final ClientIp clientIp;

    public HrController(EmployeeService employees, TimeService time, CorrectionService corrections, DeviceService devices,
                        KioskService kiosks, AppPairingService pairing, PayrollService payroll, JdbcClient db,
                        NetworkService networks, ClientIp clientIp, FaceRequestService faceRequests) {
        this.faceRequests = faceRequests;
        this.networks = networks;
        this.clientIp = clientIp;
        this.employees = employees;
        this.time = time;
        this.corrections = corrections;
        this.devices = devices;
        this.kiosks = kiosks;
        this.pairing = pairing;
        this.payroll = payroll;
        this.db = db;
    }

    // employees
    @GetMapping("/employees") public List<M.EmpRow> employees() { return employees.listRows(); }
    @PostMapping("/employees") public M.EmpView createEmployee(@RequestBody EmployeeService.Input in) { return employees.create(in); }
    @PutMapping("/employees/{id}") public M.EmpView updateEmployee(@AuthenticationPrincipal Actor a, @PathVariable long id, @RequestBody EmployeeService.Input in) { return employees.update(id, in, a.employeeId()); }

    @PostMapping("/employees/{id}/app-code")
    public Map<String, String> appCode(@PathVariable long id) { return Map.of("code", pairing.createCode(id)); }

    @PostMapping("/employees/{id}/app-revoke")
    public Map<String, String> appRevoke(@PathVariable long id) { pairing.revokeForEmployee(id); return Map.of("status", "REVOKED"); }

    @PostMapping("/employees/{id}/face")
    public Map<String, String> enrolFace(@PathVariable long id, @RequestBody FaceBody b) { kiosks.enrolFace(id, b.descriptors()); return Map.of("status", "ENROLLED"); }

    // locations
    @GetMapping("/attendance/locations")
    public List<M.Location> locations() {
        return db.sql("SELECT id, name, latitude, longitude, radius_meters, active FROM attendance_locations ORDER BY id").query(M.Location.class).list();
    }

    @PostMapping("/attendance/locations")
    public Map<String, String> addLocation(@RequestBody LocationBody b) {
        if (b.name() == null || b.latitude() == null || b.longitude() == null || b.radiusMeters() == null || b.radiusMeters() < 10) {
            throw ApiException.bad("name, latitude, longitude and radiusMeters (>= 10) are required");
        }
        db.sql("INSERT INTO attendance_locations (name, latitude, longitude, radius_meters) VALUES (?,?,?,?)")
                .param(b.name()).param(b.latitude()).param(b.longitude()).param(b.radiusMeters()).update();
        return Map.of("status", "CREATED");
    }

    @PutMapping("/attendance/locations/{id}")
    public Map<String, String> updateLocation(@PathVariable long id, @RequestBody LocationBody b) {
        int n = db.sql("UPDATE attendance_locations SET name = COALESCE(?, name), latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), radius_meters = COALESCE(?, radius_meters), active = COALESCE(?, active) WHERE id = ?")
                .param(b.name()).param(b.latitude()).param(b.longitude()).param(b.radiusMeters()).param(b.active()).param(id).update();
        if (n == 0) throw ApiException.notFound("Location");
        return Map.of("status", "UPDATED");
    }

    // office networks (WiFi verification)
    public record NetworkBody(String name, String cidr, String bssid, Boolean active) {}

    @GetMapping("/networks") public List<NetworkService.Net> networks() { return networks.list(); }
    @GetMapping("/networks/my-ip") public Map<String, String> myIp(jakarta.servlet.http.HttpServletRequest req) { return Map.of("ip", clientIp.of(req)); }
    @PostMapping("/networks") public Map<String, String> addNetwork(@RequestBody NetworkBody b) { networks.add(b.name(), b.cidr(), b.bssid()); return Map.of("status", "CREATED"); }
    @PutMapping("/networks/{id}") public Map<String, String> toggleNetwork(@PathVariable long id, @RequestBody NetworkBody b) {
        if (b.active() == null) throw ApiException.bad("active is required");
        networks.setActive(id, b.active());
        return Map.of("status", "UPDATED");
    }
    @DeleteMapping("/networks/{id}") public Map<String, String> deleteNetwork(@PathVariable long id) { networks.delete(id); return Map.of("status", "DELETED"); }

    // photo approval requests (face did not match)
    @GetMapping("/face-requests") public List<M.FaceRequestView> faceRequests() { return faceRequests.pending(); }

    @GetMapping(value = "/face-requests/{id}/photo", produces = org.springframework.http.MediaType.IMAGE_JPEG_VALUE)
    public byte[] faceRequestPhoto(@PathVariable long id) { return faceRequests.photo(id); }

    @PostMapping("/face-requests/{id}/approve")
    public Map<String, String> approveFaceRequest(@AuthenticationPrincipal Actor a, @PathVariable long id) { faceRequests.approve(id, a.employeeId()); return Map.of("status", "APPROVED"); }

    @PostMapping("/face-requests/{id}/reject")
    public Map<String, String> rejectFaceRequest(@AuthenticationPrincipal Actor a, @PathVariable long id) { faceRequests.reject(id, a.employeeId()); return Map.of("status", "REJECTED"); }

    // approvals
    @GetMapping("/attendance/pending") public List<M.PendingSession> pending() { return time.pending(); }
    @GetMapping("/attendance/pending/count") public Map<String, Integer> pendingCount() { return Map.of("count", time.pending().size()); }

    @PostMapping("/attendance/sessions/{id}/approve")
    public Map<String, String> approve(@AuthenticationPrincipal Actor a, @PathVariable long id) { time.approve(id, a.employeeId()); return Map.of("status", "APPROVED"); }

    @PostMapping("/attendance/sessions/{id}/reject")
    public Map<String, String> reject(@AuthenticationPrincipal Actor a, @PathVariable long id) { time.reject(id, a.employeeId()); return Map.of("status", "REJECTED"); }

    @PostMapping("/attendance/sessions/approve-many")
    public Map<String, Object> approveMany(@AuthenticationPrincipal Actor a, @RequestBody IdsBody b) {
        int ok = 0;
        List<String> failed = new java.util.ArrayList<>();
        for (Long id : b.ids()) {
            try { time.approve(id, a.employeeId()); ok++; } catch (ApiException e) { failed.add(id + ": " + e.getMessage()); }
        }
        return Map.of("approved", ok, "failed", failed);
    }

    @GetMapping("/attendance/register")
    public List<M.RegisterRow> register(@RequestParam LocalDate date) { return employees.register(date); }

    // corrections
    @GetMapping("/attendance/corrections") public List<M.CorrectionView> pendingCorrections() { return corrections.pending(); }

    @PostMapping("/attendance/corrections/{id}/approve")
    public Map<String, String> approveCorrection(@AuthenticationPrincipal Actor a, @PathVariable long id) { corrections.approve(id, a.employeeId()); return Map.of("status", "APPROVED"); }

    @PostMapping("/attendance/corrections/{id}/reject")
    public Map<String, String> rejectCorrection(@AuthenticationPrincipal Actor a, @PathVariable long id) { corrections.reject(id, a.employeeId()); return Map.of("status", "REJECTED"); }

    @PostMapping("/attendance/corrections/apply")
    public M.Session apply(@AuthenticationPrincipal Actor a, @RequestBody ApplyDate b) {
        return time.applyForDate(b.employeeId(), b.date(), b.checkIn(), b.checkOut(), a.employeeId());
    }

    @PostMapping("/attendance/corrections/apply-session")
    public M.Session applySession(@AuthenticationPrincipal Actor a, @RequestBody ApplySession b) {
        return time.applyToSession(b.sessionId(), b.checkIn(), b.checkOut(), a.employeeId());
    }

    // devices
    @GetMapping("/attendance/devices") public List<M.Device> devices() { return devices.list(null); }
    @PostMapping("/attendance/devices/{id}/approve") public Map<String, String> approveDevice(@PathVariable long id) { devices.approve(id); return Map.of("status", "APPROVED"); }
    @PostMapping("/attendance/devices/{id}/revoke") public Map<String, String> revokeDevice(@PathVariable long id) { devices.revoke(id); return Map.of("status", "REVOKED"); }

    // kiosks
    @GetMapping("/kiosks") public List<M.Kiosk> kiosks() { return kiosks.list(); }
    @PostMapping("/kiosks") public Map<String, Object> createKiosk(@RequestBody KioskBody b) {
        if (b.name() == null || b.name().isBlank()) throw ApiException.bad("name is required");
        return kiosks.create(b.name(), b.verifyMode());
    }
    @PostMapping("/kiosks/{id}/pair-code") public Map<String, String> pairCode(@PathVariable long id) { return Map.of("code", kiosks.newPairCode(id)); }
    @DeleteMapping("/kiosks/{id}") public Map<String, String> deactivateKiosk(@PathVariable long id) { kiosks.deactivate(id); return Map.of("status", "DEACTIVATED"); }

    // payroll
    @PostMapping("/payroll/generate")
    public Map<String, Object> generate(@AuthenticationPrincipal Actor a, @RequestBody PayrollBody b) {
        return Map.of("runId", payroll.generate(b.period(), b.mode(), a.employeeId()));
    }
    @GetMapping("/payroll/runs") public List<M.Run> runs() { return payroll.runs(); }
    @GetMapping("/payroll/runs/{id}/payslips") public List<M.PayslipView> payslips(@PathVariable long id) { return payroll.payslips(id); }
    @PostMapping("/payroll/payslips/{id}/adjust")
    public Map<String, String> adjust(@PathVariable long id, @RequestBody AdjustBody b) {
        if (b.amount() == null) throw ApiException.bad("amount is required");
        payroll.adjust(id, b.amount());
        return Map.of("status", "ADJUSTED");
    }
}
