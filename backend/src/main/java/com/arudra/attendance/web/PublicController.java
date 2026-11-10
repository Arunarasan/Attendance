package com.arudra.attendance.web;

import com.arudra.attendance.service.AppPairingService;
import com.arudra.attendance.service.DeviceService;
import com.arudra.attendance.service.FaceRequestService;
import com.arudra.attendance.service.KioskService;
import com.arudra.attendance.service.VerificationService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Unauthenticated entry points: app pairing and the kiosk device API (kiosk calls carry X-Kiosk-Token). */
@RestController
@RequestMapping("/api/public")
public class PublicController {
    public record PairApp(String code, String publicKey, String label, String bssid) {}
    public record PairKiosk(String code) {}
    public record Face(double[] descriptor) {}
    public record Manual(String identifier, double[] descriptor) {}
    public record FaceRequestBody(String employeeCode, String phone, String action, String photo, Double lat, Double lng, Double accuracy, String bssid) {}
    public record FacePunch(double[] descriptor, Double lat, Double lng, Double accuracy, String bssid) {}

    private final AppPairingService pairing;
    private final KioskService kiosks;
    private final ClientIp clientIp;
    private final FacePunchThrottle faceThrottle;
    private final FaceRequestService faceRequests;
    private final LoginThrottle loginThrottle;

    public PublicController(AppPairingService pairing, KioskService kiosks, ClientIp clientIp, FacePunchThrottle faceThrottle,
                            FaceRequestService faceRequests, LoginThrottle loginThrottle) {
        this.faceRequests = faceRequests;
        this.loginThrottle = loginThrottle;
        this.faceThrottle = faceThrottle;
        this.pairing = pairing;
        this.kiosks = kiosks;
        this.clientIp = clientIp;
    }

    @PostMapping("/app/pair")
    public Map<String, Object> pairApp(@RequestBody PairApp b, jakarta.servlet.http.HttpServletRequest req) {
        return pairing.pair(b.code(), b.publicKey(), b.label(), new DeviceService.Proof(clientIp.of(req), b.bssid()));
    }

    @PostMapping("/kiosk/pair")
    public Map<String, String> pairKiosk(@RequestBody PairKiosk b) {
        return Map.of("token", kiosks.pair(b.code()));
    }

    @PostMapping("/kiosk/punch")
    public KioskService.PunchResult face(@RequestHeader(value = "X-Kiosk-Token", required = false) String token, @RequestBody Face b) {
        return kiosks.punchFace(token, b.descriptor());
    }

    @PostMapping("/face-punch")
    public KioskService.PunchResult facePunch(@RequestBody FacePunch b, jakarta.servlet.http.HttpServletRequest req) {
        String ip = clientIp.of(req);
        faceThrottle.check(ip);
        var in = new VerificationService.PunchInput(b.lat(), b.lng(), b.accuracy(), null, null, null, null, b.bssid(), ip);
        var r = kiosks.punchFaceOpen(b.descriptor(), in);
        if ("NOT_RECOGNISED".equals(r.outcome())) faceThrottle.fail(ip);
        return r;
    }

    /** The face would not match: employee ID + phone + a photo ask HR to approve the punch. Nothing is clocked until HR does. */
    @PostMapping("/face-request")
    public Map<String, Object> faceRequest(@RequestBody FaceRequestBody b, jakarta.servlet.http.HttpServletRequest req) {
        String ip = clientIp.of(req);
        String key = "fr:" + (b.employeeCode() == null ? "" : b.employeeCode());
        loginThrottle.check(key, ip);
        var ctx = new VerificationService.PunchInput(b.lat(), b.lng(), b.accuracy(), null, null, null, null, b.bssid(), ip);
        try {
            long id = faceRequests.submit(b.employeeCode(), b.phone(), b.action(), b.photo(), ctx);
            loginThrottle.ok(key, ip);
            return Map.of("status", "PENDING", "id", id);
        } catch (com.arudra.attendance.config.ApiException e) {
            if ("BAD_DETAILS".equals(e.code())) loginThrottle.fail(key, ip);
            throw e;
        }
    }

    @PostMapping("/kiosk/punch-manual")
    public KioskService.PunchResult manual(@RequestHeader(value = "X-Kiosk-Token", required = false) String token, @RequestBody Manual b) {
        return kiosks.punchManual(token, b.identifier(), b.descriptor());
    }
}
