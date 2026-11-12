package com.arudra.attendance.web;

import com.arudra.attendance.config.AppProps;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Regression for the audit finding "X-Forwarded-For: the first (client-supplied) value was trusted". */
class ClientIpTest {
    private static ClientIp with(boolean trust, int hops) {
        return new ClientIp(new AppProps("x".repeat(40), 1, "a@b.c", "p", "http://x", trust, hops, true, null));
    }

    private static MockHttpServletRequest req(String xff) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.setRemoteAddr("10.0.0.1"); // the proxy
        if (xff != null) r.addHeader("X-Forwarded-For", xff);
        return r;
    }

    @Test
    void headerIsIgnoredUnlessTheProxyIsTrusted() {
        assertEquals("10.0.0.1", with(false, 1).of(req("1.2.3.4")));
    }

    @Test
    void oneProxy_theClientIsTheLastEntryAndForgedEntriesOnTheLeftAreIgnored() {
        assertEquals("203.0.113.7", with(true, 1).of(req("203.0.113.7")));
        assertEquals("203.0.113.7", with(true, 1).of(req("9.9.9.9, 8.8.8.8, 203.0.113.7")), "a client-supplied prefix must not win");
        assertEquals("203.0.113.7", with(true, 1).of(req("9.9.9.9,203.0.113.7")), "no spaces");
    }

    @Test
    void twoProxies_theClientIsSecondFromTheRight() {
        assertEquals("203.0.113.7", with(true, 2).of(req("1.1.1.1, 203.0.113.7, 10.0.0.9")));
    }

    @Test
    void headerShorterThanTheConfiguredChainFallsBackToThePeer() {
        assertEquals("10.0.0.1", with(true, 2).of(req("203.0.113.7")));
        assertEquals("10.0.0.1", with(true, 1).of(req(null)));
        assertEquals("10.0.0.1", with(true, 1).of(req("  ")));
    }
}
