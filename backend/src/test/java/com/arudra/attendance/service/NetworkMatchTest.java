package com.arudra.attendance.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class NetworkMatchTest {
    @Test
    void ipv4CidrMatching() {
        assertTrue(NetworkService.contains("203.0.113.0/24", "203.0.113.77"));
        assertFalse(NetworkService.contains("203.0.113.0/24", "203.0.114.1"));
        assertTrue(NetworkService.contains("203.0.113.7", "203.0.113.7")); // bare IP means /32
        assertFalse(NetworkService.contains("203.0.113.7", "203.0.113.8"));
        assertTrue(NetworkService.contains("10.0.0.0/8", "10.200.1.1"));
    }

    @Test
    void ipv6AndMixedFamilies() {
        assertTrue(NetworkService.contains("::1/128", "0:0:0:0:0:0:0:1"));
        assertTrue(NetworkService.contains("2001:db8::/32", "2001:db8:1::5"));
        assertFalse(NetworkService.contains("10.0.0.0/8", "::1")); // different families never match
    }

    @Test
    void validation() {
        assertTrue(NetworkService.valid("192.168.1.0/24"));
        assertFalse(NetworkService.valid("192.168.1.0/33"));
        assertFalse(NetworkService.valid("not-an-ip"));
        assertFalse(NetworkService.valid("1.2.3.4/8/9"));
    }
}
