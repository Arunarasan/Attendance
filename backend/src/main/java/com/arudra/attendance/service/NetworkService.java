package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.util.List;

/**
 * Office WiFi verification. A browser cannot read the WiFi name, so the reliable signal is the public IP the request
 * comes from (the office router's address). The Android app can also send the access point's BSSID.
 * With no networks configured nothing is checked.
 */
@Service
public class NetworkService {
    public enum Result { NOT_CONFIGURED, MATCH, MISMATCH }

    public record Net(long id, String name, String cidr, String bssid, boolean active) {}

    private final JdbcClient db;

    public NetworkService(JdbcClient db) {
        this.db = db;
    }

    public List<Net> list() {
        return db.sql("SELECT id, name, cidr, bssid, active FROM office_networks ORDER BY id").query(Net.class).list();
    }

    public Result check(String clientIp, String bssid) {
        List<Net> nets = db.sql("SELECT id, name, cidr, bssid, active FROM office_networks WHERE active = TRUE").query(Net.class).list();
        if (nets.isEmpty()) return Result.NOT_CONFIGURED;
        for (Net n : nets) {
            if (n.cidr() != null && clientIp != null && contains(n.cidr(), clientIp)) return Result.MATCH;
            if (n.bssid() != null && bssid != null && n.bssid().equalsIgnoreCase(bssid.trim())) return Result.MATCH;
        }
        return Result.MISMATCH;
    }

    public void add(String name, String cidr, String bssid) {
        if (name == null || name.isBlank()) throw ApiException.bad("name is required");
        String c = cidr == null || cidr.isBlank() ? null : cidr.trim();
        String b = bssid == null || bssid.isBlank() ? null : bssid.trim().toLowerCase();
        if (c == null && b == null) throw ApiException.bad("Give an IP/CIDR or a BSSID");
        if (c != null && !valid(c)) throw ApiException.bad("Invalid IP/CIDR, for example 203.0.113.7 or 203.0.113.0/24");
        db.sql("INSERT INTO office_networks (name, cidr, bssid) VALUES (?,?,?)").param(name.trim()).param(c).param(b).update();
    }

    public void setActive(long id, boolean active) {
        if (db.sql("UPDATE office_networks SET active = ? WHERE id = ?").param(active).param(id).update() == 0) throw ApiException.notFound("Network");
    }

    public void delete(long id) {
        db.sql("DELETE FROM office_networks WHERE id = ?").param(id).update();
    }

    static boolean valid(String cidr) {
        try {
            String[] p = cidr.split("/");
            byte[] a = InetAddress.getByName(p[0]).getAddress();
            if (p.length > 2) return false;
            if (p.length == 2) {
                int len = Integer.parseInt(p[1]);
                return len >= 0 && len <= a.length * 8;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean contains(String cidr, String ip) {
        try {
            String[] p = cidr.split("/");
            byte[] net = InetAddress.getByName(p[0]).getAddress();
            byte[] addr = InetAddress.getByName(ip.trim()).getAddress();
            if (net.length != addr.length) return false;
            int bits = p.length == 2 ? Integer.parseInt(p[1]) : net.length * 8;
            for (int i = 0; i < bits; i++) {
                int mask = 0x80 >> (i % 8);
                if ((net[i / 8] & mask) != (addr[i / 8] & mask)) return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
