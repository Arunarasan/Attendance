package com.arudra.attendance.config;

import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

/** Regression for the audit finding "admin token can be forged with the public default JWT secret". */
class JwtSecretTest {
    private static final String RETIRED_DEFAULT = "dev-only-secret-change-me-dev-only-secret-change-me";

    @Test
    void retiredPublicDefaultIsRefused() {
        assertThrows(IllegalStateException.class, () -> JwtService.resolveSecret(RETIRED_DEFAULT));
    }

    @Test
    void shortSecretIsRefused() {
        assertThrows(IllegalStateException.class, () -> JwtService.resolveSecret("too-short"));
        assertThrows(IllegalStateException.class, () -> JwtService.resolveSecret("x".repeat(31)));
    }

    @Test
    void unsetSecretGetsARandomOneEachRun() {
        byte[] a = JwtService.resolveSecret(null);
        byte[] b = JwtService.resolveSecret("   ");
        assertTrue(a.length >= 32);
        assertFalse(Arrays.equals(a, b), "each run must get a different random secret");
        assertNotEquals(RETIRED_DEFAULT, new String(a, java.nio.charset.StandardCharsets.ISO_8859_1));
    }

    @Test
    void properSecretIsUsedAsIs() {
        String secret = "a-private-secret-with-more-than-32-chars";
        assertArrayEquals(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), JwtService.resolveSecret(secret));
    }
}
