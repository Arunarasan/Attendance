package com.arudra.attendance.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProps(String jwtSecret, int jwtHours, String seedAdminEmail, String seedAdminPassword,
                       String corsOrigins, boolean trustProxy, Attendance attendance) {
    public record Attendance(int geoGraceMeters, int maxAccuracyMarginMeters, int kioskMinGapSeconds,
                             double faceConfident, double faceWeak, double faceMargin,
                             boolean phoneFaceRequired, double faceLearn, String onCheckFail) {}
}
