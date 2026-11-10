package com.arudra.attendance.config;

/** Authenticated caller. deviceId is set only when authenticated with a paired-app device token. */
public record Actor(long employeeId, String role, Long deviceId) {
    public boolean isHr() {
        return "HR".equals(role) || "ADMIN".equals(role);
    }
}
