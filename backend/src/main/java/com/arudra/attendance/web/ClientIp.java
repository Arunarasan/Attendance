package com.arudra.attendance.web;

import com.arudra.attendance.config.AppProps;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/** The caller's IP. X-Forwarded-For is honoured only when app.trust-proxy is on (a proxy you control must set it). */
@Component
public class ClientIp {
    private final boolean trustProxy;

    public ClientIp(AppProps props) {
        this.trustProxy = props.trustProxy();
    }

    public String of(HttpServletRequest req) {
        if (trustProxy) {
            String xff = req.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
