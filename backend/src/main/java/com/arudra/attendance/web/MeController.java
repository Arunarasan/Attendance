package com.arudra.attendance.web;

import com.arudra.attendance.config.Actor;
import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.config.JwtService;
import com.arudra.attendance.model.M;
import com.arudra.attendance.service.*;
import com.arudra.attendance.service.VerificationService.PunchInput;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/** Login plus everything an employee does for themselves (web portal JWT or paired-app device token). */
@RestController
@RequestMapping("/api")
public class MeController {
    public record Login(String email, String password) {}
    public record EmployeeLogin(String employeeCode, String phone, String password) {}
    public record PunchBody(Double lat, Double lng, Double accuracy, String nonce, String signature, double[] descriptor, String bssid) {}
    public record LeaveBody(Long leaveTypeId, LocalDate startDate, LocalDate endDate, Boolean halfDay, String reason) {}
    public record FaceBody(java.util.List<double[]> descriptors) {}
    public record BindBody(String publicKey, String label, String bssid) {}
    public record CorrectionBody(LocalDate date, LocalDateTime requestedIn, LocalDateTime requestedOut, String reason) {}

    private final EmployeeService employees;
    private final JwtService jwt;
    private final TimeService time;
    private final DeviceService devices;
    private final CorrectionService corrections;
    private final PayrollService payroll;
    private final ClientIp clientIp;
    private final LoginThrottle throttle;
    private final FaceService faces;
    private final LeaveService leave;
    private final CalendarService calendar;

    public MeController(EmployeeService employees, JwtService jwt, TimeService time, DeviceService devices,
                        CorrectionService corrections, PayrollService payroll, ClientIp clientIp, LoginThrottle throttle, FaceService faces,
                        LeaveService leave, CalendarService calendar) {
        this.leave = leave;
        this.calendar = calendar;
        this.faces = faces;
        this.clientIp = clientIp;
        this.throttle = throttle;
        this.employees = employees;
        this.jwt = jwt;
        this.time = time;
        this.devices = devices;
        this.corrections = corrections;
        this.payroll = payroll;
    }

    /** HR and admin sign in with email and password. Employees use {@link #employeeLogin}. */
    @PostMapping("/auth/login")
    public Map<String, Object> login(@RequestBody Login in, jakarta.servlet.http.HttpServletRequest req) {
        String ip = clientIp.of(req);
        throttle.check(in.email(), ip);
        M.Emp e = employees.byEmail(in.email());
        if (e == null || !e.active() || !employees.passwordMatches(e, in.password())) {
            throttle.fail(in.email(), ip);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_LOGIN", "Wrong email or password");
        }
        if ("EMPLOYEE".equals(e.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "USE_EMPLOYEE_LOGIN", "Employees sign in with their employee ID, phone number and password.");
        }
        throttle.ok(in.email(), ip);
        return Map.of("token", jwt.issue(e.id(), e.role()), "employee", employees.get(e.id()));
    }

    /** Employee ID + phone number + password. All three must match; the error never says which one was wrong. */
    @PostMapping("/auth/employee-login")
    public Map<String, Object> employeeLogin(@RequestBody EmployeeLogin in, jakarta.servlet.http.HttpServletRequest req) {
        String ip = clientIp.of(req);
        throttle.check(in.employeeCode(), ip);
        M.Emp e = employees.byCode(in.employeeCode());
        boolean ok = e != null && e.active() && EmployeeService.samePhone(e.phone(), in.phone()) && employees.passwordMatches(e, in.password());
        if (!ok) {
            throttle.fail(in.employeeCode(), ip);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_LOGIN", "Wrong employee ID, phone number or password");
        }
        throttle.ok(in.employeeCode(), ip);
        return Map.of("token", jwt.issue(e.id(), e.role()), "employee", employees.get(e.id()));
    }

    @GetMapping("/nonce")
    public Map<String, String> nonce() {
        return Map.of("nonce", devices.newNonce());
    }

    @GetMapping("/me")
    public M.EmpView me(@AuthenticationPrincipal Actor a) {
        return employees.get(a.employeeId());
    }

    // ---- leave and holidays ----
    @GetMapping("/me/leave/balances")
    public List<M.LeaveBalance> leaveBalances(@AuthenticationPrincipal Actor a, @RequestParam(required = false) Integer year) {
        return leave.balances(a.employeeId(), year == null ? time.now().getYear() : year);
    }

    @GetMapping("/me/leave")
    public List<M.LeaveRequestView> myLeave(@AuthenticationPrincipal Actor a) { return leave.mine(a.employeeId()); }

    @PostMapping("/me/leave")
    public Map<String, Object> requestLeave(@AuthenticationPrincipal Actor a, @RequestBody LeaveBody b) {
        if (b.leaveTypeId() == null) throw ApiException.bad("Choose a leave type");
        long id = leave.request(a.employeeId(), b.leaveTypeId(), b.startDate(), b.endDate(), Boolean.TRUE.equals(b.halfDay()), b.reason(), null);
        return Map.of("status", "PENDING", "id", id);
    }

    @PostMapping("/me/leave/{id}/cancel")
    public Map<String, String> cancelLeave(@AuthenticationPrincipal Actor a, @PathVariable long id) {
        leave.cancel(id, a.employeeId());
        return Map.of("status", "CANCELLED");
    }

    @GetMapping("/me/holidays")
    public List<M.Holiday> holidays(@RequestParam(required = false) Integer year) { return calendar.holidays(year == null ? time.now().getYear() : year); }

    @GetMapping("/me/face")
    public Map<String, Boolean> faceStatus(@AuthenticationPrincipal Actor a) {
        return Map.of("enrolled", faces.hasTemplates(a.employeeId()));
    }

    @PostMapping("/me/face")
    public Map<String, String> enrolFace(@AuthenticationPrincipal Actor a, @RequestBody FaceBody b) {
        faces.enrolOnce(a.employeeId(), b.descriptors());
        return Map.of("status", "ENROLLED");
    }

    @GetMapping("/me/today")
    public Map<String, Object> today(@AuthenticationPrincipal Actor a) {
        LocalDate today = time.now().toLocalDate();
        M.Session open = time.openSession(a.employeeId());
        return Map.of(
                "open", open == null ? Map.of() : open,
                "isOpen", open != null,
                "onBreak", open != null && open.breakStarted() != null,
                "sessions", time.sessionsFor(a.employeeId(), today, today),
                "days", time.days(a.employeeId(), today, today));
    }

    @PostMapping("/me/punch/{action}")
    public M.Session punch(@AuthenticationPrincipal Actor a, @PathVariable String action, @RequestBody(required = false) PunchBody b,
                           jakarta.servlet.http.HttpServletRequest req) {
        PunchBody body = b == null ? new PunchBody(null, null, null, null, null, null, null) : b;
        PunchInput in = new PunchInput(body.lat(), body.lng(), body.accuracy(), body.nonce(), body.signature(), a.deviceId(),
                body.descriptor(), body.bssid(), clientIp.of(req));
        return switch (action) {
            case "in" -> time.clockIn(a.employeeId(), in);
            case "out" -> time.clockOut(a.employeeId(), in);
            case "break-start" -> time.startBreak(a.employeeId());
            case "break-end" -> time.endBreak(a.employeeId());
            default -> throw ApiException.bad("Unknown action");
        };
    }

    @GetMapping("/me/timesheet")
    public Map<String, Object> timesheet(@AuthenticationPrincipal Actor a, @RequestParam String month) {
        YearMonth ym = parse(month);
        return Map.of("days", time.days(a.employeeId(), ym.atDay(1), ym.atEndOfMonth()),
                "sessions", time.sessionsFor(a.employeeId(), ym.atDay(1), ym.atEndOfMonth()));
    }

    @PostMapping("/me/corrections")
    public Map<String, String> requestCorrection(@AuthenticationPrincipal Actor a, @RequestBody CorrectionBody b) {
        corrections.request(a.employeeId(), b.date(), b.requestedIn(), b.requestedOut(), b.reason());
        return Map.of("status", "PENDING");
    }

    @GetMapping("/me/corrections")
    public List<M.Correction> myCorrections(@AuthenticationPrincipal Actor a) {
        return corrections.mine(a.employeeId());
    }

    @GetMapping("/me/payslips")
    public List<M.Payslip> payslips(@AuthenticationPrincipal Actor a) {
        return payroll.mine(a.employeeId());
    }

    @PostMapping("/me/devices/bind")
    public M.Device bind(@AuthenticationPrincipal Actor a, @RequestBody BindBody b, jakarta.servlet.http.HttpServletRequest req) {
        return devices.bind(a.employeeId(), b.publicKey(), b.label(), new DeviceService.Proof(clientIp.of(req), b.bssid()));
    }

    @GetMapping("/me/devices")
    public List<M.Device> myDevices(@AuthenticationPrincipal Actor a) {
        return devices.list(a.employeeId());
    }

    private static YearMonth parse(String month) {
        try { return YearMonth.parse(month); } catch (Exception e) { throw ApiException.bad("month must look like 2026-10"); }
    }
}
