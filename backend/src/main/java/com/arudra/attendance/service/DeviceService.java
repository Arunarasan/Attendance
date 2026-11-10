package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.config.Crypto;
import com.arudra.attendance.model.M;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;

/** Phone binding: one approved device per employee, proven by an ECDSA P-256 signature over a server nonce. */
@Service
public class DeviceService {
    public enum Outcome { SKIPPED, VERIFIED, NOT_BOUND, NO_PROOF, BAD_CHALLENGE, BAD_SIGNATURE }

    private final JdbcClient db;
    private final DeviceEvents events;
    private final NetworkService networks;

    public DeviceService(JdbcClient db, DeviceEvents events, NetworkService networks) {
        this.db = db;
        this.events = events;
        this.networks = networks;
    }

    /** Evidence gathered while registering a phone. Face is for clocking in, not for registering or logging in. */
    public record Proof(String clientIp, String bssid) {}

    /** Whether the request came from the office network (true when no networks are configured). */
    public boolean verifyRegistration(long employeeId, Proof p) {
        return networks.check(p == null ? null : p.clientIp(), p == null ? null : p.bssid()) != NetworkService.Result.MISMATCH;
    }

    public String newNonce() {
        db.sql("DELETE FROM nonces WHERE expires_at < ?").param(LocalDateTime.now()).update();
        String n = Crypto.randomToken();
        db.sql("INSERT INTO nonces (nonce, expires_at) VALUES (?, ?)").param(n).param(LocalDateTime.now().plusMinutes(2)).update();
        return n;
    }

    /** Single-use: returns true only if the nonce existed and had not expired. */
    private boolean consumeNonce(String nonce) {
        int n = db.sql("DELETE FROM nonces WHERE nonce = ? AND expires_at >= ?").param(nonce).param(LocalDateTime.now()).update();
        return n == 1;
    }

    public Outcome check(long employeeId, String mode, Long tokenDeviceId, String nonce, String signature) {
        if ("OFF".equals(mode)) return Outcome.SKIPPED;
        List<M.DeviceKey> keys = db.sql("SELECT id, public_key FROM user_devices WHERE employee_id = ? AND status = 'APPROVED'")
                .param(employeeId).query(M.DeviceKey.class).list();
        Outcome out;
        if (keys.isEmpty()) {
            out = Outcome.NOT_BOUND;
        } else if (nonce == null || nonce.isBlank() || signature == null || signature.isBlank()) {
            out = Outcome.NO_PROOF;
        } else if (!consumeNonce(nonce)) {
            out = Outcome.BAD_CHALLENGE;
        } else {
            out = Outcome.BAD_SIGNATURE;
            for (M.DeviceKey k : keys) {
                if (tokenDeviceId != null && k.id() != tokenDeviceId) continue;
                if (verify(k.publicKey(), nonce, signature)) { out = Outcome.VERIFIED; break; }
            }
        }
        if (out != Outcome.VERIFIED) events.log(employeeId, null, "CHECK_" + out.name(), mode);
        if ("HARD".equals(mode) && out != Outcome.VERIFIED) {
            throw new ApiException(HttpStatus.FORBIDDEN, "DEVICE_NOT_AUTHORIZED", "This phone is not authorised for attendance (" + out + ")");
        }
        return out;
    }

    static boolean verify(String publicKeyB64, String nonce, String signatureB64) {
        try {
            PublicKey pk = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(publicKeyB64)));
            byte[] sig = Base64.getDecoder().decode(signatureB64);
            // WebCrypto emits raw r||s (64 bytes); Android Keystore emits DER.
            Signature s = Signature.getInstance(sig.length == 64 ? "SHA256withECDSAinP1363Format" : "SHA256withECDSA");
            s.initVerify(pk);
            s.update(nonce.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return s.verify(sig);
        } catch (Exception e) {
            return false;
        }
    }

    /** Employee binds a phone. The first device is auto-approved; later ones wait for HR. */
    @Transactional
    public M.Device bind(long employeeId, String publicKey, String label, Proof proof) {
        boolean onNetwork = verifyRegistration(employeeId, proof);
        try {
            KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(publicKey)));
        } catch (Exception e) {
            throw ApiException.bad("Invalid public key");
        }
        int approved = db.sql("SELECT COUNT(*) FROM user_devices WHERE employee_id = ? AND status = 'APPROVED'")
                .param(employeeId).query(Integer.class).single();
        // Auto-approve only the first phone, and only from the office network. Anything else waits for HR.
        String status = approved == 0 && onNetwork ? "APPROVED" : "PENDING";
        long id = insertDevice(employeeId, publicKey, label, status);
        events.log(employeeId, id, "BIND_" + status, onNetwork ? label : label + " (off office network)");
        return device(id);
    }

    /** Used by app pairing: replaces any existing device (re-pair revokes the old phone). */
    @Transactional
    public long bindReplacing(long employeeId, String publicKey, String label) {
        db.sql("UPDATE user_devices SET status = 'REVOKED' WHERE employee_id = ? AND status IN ('APPROVED','PENDING')").param(employeeId).update();
        db.sql("UPDATE app_tokens SET revoked_at = ? WHERE employee_id = ? AND revoked_at IS NULL").param(LocalDateTime.now()).param(employeeId).update();
        long id = insertDevice(employeeId, publicKey, label, "APPROVED");
        events.log(employeeId, id, "APP_PAIRED", label);
        return id;
    }

    private long insertDevice(long employeeId, String publicKey, String label, String status) {
        var kh = new org.springframework.jdbc.support.GeneratedKeyHolder();
        db.sql("INSERT INTO user_devices (employee_id, public_key, label, status) VALUES (?,?,?,?)")
                .param(employeeId).param(publicKey).param(label).param(status).update(kh, "id");
        return kh.getKey().longValue();
    }

    @Transactional
    public void approve(long deviceId) {
        M.Device d = device(deviceId);
        db.sql("UPDATE user_devices SET status = 'REVOKED' WHERE employee_id = ? AND status = 'APPROVED'").param(d.employeeId()).update();
        db.sql("UPDATE user_devices SET status = 'APPROVED' WHERE id = ?").param(deviceId).update();
        events.log(d.employeeId(), deviceId, "APPROVED", null);
    }

    @Transactional
    public void revoke(long deviceId) {
        M.Device d = device(deviceId);
        db.sql("UPDATE user_devices SET status = 'REVOKED' WHERE id = ?").param(deviceId).update();
        db.sql("UPDATE app_tokens SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL").param(LocalDateTime.now()).param(deviceId).update();
        events.log(d.employeeId(), deviceId, "REVOKED", null);
    }

    public M.Device device(long id) {
        return db.sql("SELECT id, employee_id, label, status, created_at FROM user_devices WHERE id = ?").param(id)
                .query(M.Device.class).optional().orElseThrow(() -> ApiException.notFound("Device"));
    }

    public List<M.Device> list(Long employeeId) {
        String sql = "SELECT id, employee_id, label, status, created_at FROM user_devices WHERE status <> 'REVOKED'"
                + (employeeId != null ? " AND employee_id = ?" : "") + " ORDER BY id DESC";
        var s = db.sql(sql);
        if (employeeId != null) s = s.param(employeeId);
        return s.query(M.Device.class).list();
    }
}
