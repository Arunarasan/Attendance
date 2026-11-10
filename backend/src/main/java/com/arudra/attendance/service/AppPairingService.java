package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.config.Crypto;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

/** Pair-once login for the personal employee app: one-time code -> device key + long-lived revocable token. */
@Service
public class AppPairingService {
    private final JdbcClient db;
    private final DeviceService devices;

    public AppPairingService(JdbcClient db, DeviceService devices) {
        this.db = db;
        this.devices = devices;
    }

    @Transactional
    public String createCode(long employeeId) {
        Integer n = db.sql("SELECT COUNT(*) FROM employees WHERE id = ? AND active = TRUE").param(employeeId).query(Integer.class).single();
        if (n == 0) throw ApiException.notFound("Employee");
        db.sql("DELETE FROM pairing_codes WHERE employee_id = ? AND used_at IS NULL").param(employeeId).update();
        String code = Crypto.randomCode();
        db.sql("INSERT INTO pairing_codes (employee_id, code_hash, expires_at) VALUES (?,?,?)")
                .param(employeeId).param(Crypto.sha256(code)).param(LocalDateTime.now().plusHours(24)).update();
        return code;
    }

    /** The phone supplies the public half of a key held in its Keystore; the private half never leaves it. */
    @Transactional
    public Map<String, Object> pair(String code, String publicKey, String label, DeviceService.Proof proof) {
        String hash = Crypto.sha256(code == null ? "" : code.trim().toUpperCase());
        Long employeeId = db.sql("SELECT employee_id FROM pairing_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at >= ?")
                .param(hash).param(LocalDateTime.now()).query(Long.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "BAD_CODE", "Invalid or expired code"));
        // Pairing issues a working token at once, so it must come from the office network.
        if (!devices.verifyRegistration(employeeId, proof)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "NOT_ON_OFFICE_NETWORK", "Connect to the office WiFi to pair this phone.");
        }
        long deviceId = devices.bindReplacing(employeeId, publicKey, label);
        String token = Crypto.randomToken();
        db.sql("INSERT INTO app_tokens (employee_id, device_id, token_hash) VALUES (?,?,?)")
                .param(employeeId).param(deviceId).param(Crypto.sha256(token)).update();
        db.sql("UPDATE pairing_codes SET used_at = ? WHERE code_hash = ?").param(LocalDateTime.now()).param(hash).update();
        return Map.of("deviceToken", token, "deviceId", deviceId, "employeeId", employeeId);
    }

    @Transactional
    public void revokeForEmployee(long employeeId) {
        db.sql("UPDATE app_tokens SET revoked_at = ? WHERE employee_id = ? AND revoked_at IS NULL").param(LocalDateTime.now()).param(employeeId).update();
        db.sql("UPDATE user_devices SET status = 'REVOKED' WHERE employee_id = ? AND status <> 'REVOKED'").param(employeeId).update();
    }
}
