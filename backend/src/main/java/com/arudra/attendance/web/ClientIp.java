package com.arudra.attendance.web;

import com.arudra.attendance.config.AppProps;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * The caller's IP. X-Forwarded-For is honoured only when app.trust-proxy is on (a proxy you control must set it).
 *
 * Each proxy appends the address it received the request from, so the entries on the right were added by proxies you
 * control and the entries on the left were supplied by the caller and can be forged. The client address is therefore the
 * entry {@code app.trusted-proxy-hops} places from the right (1 = one proxy in front of the app), never the first one.
 * If the header has fewer entries than that, it was not set by the expected proxies and the direct peer address is used.
 */
@Component
public class ClientIp {
    private final boolean trustProxy;
    private final int hops;

    public ClientIp(AppProps props) {
        this.trustProxy = props.trustProxy();
        this.hops = Math.max(1, props.trustedProxyHops());
    }

    public String of(HttpServletRequest req) {
        if (trustProxy) {
            String xff = req.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                String[] parts = xff.split(",");
                int i = parts.length - hops;
                if (i >= 0 && !parts[i].isBlank()) return parts[i].trim();
            }
        }
        return req.getRemoteAddr();
    }
}
