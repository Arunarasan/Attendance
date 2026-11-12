package com.arudra.attendance.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Configuration
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain chain(HttpSecurity http, TokenFilter tokenFilter,
                                @org.springframework.beans.factory.annotation.Qualifier("corsConfigurationSource") CorsConfigurationSource cors) throws Exception {
        http.csrf(c -> c.disable())
                .cors(c -> c.configurationSource(cors))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // This server only returns JSON and images, never pages: lock down what a browser may do with a response.
                // HSTS is sent on every response (the app usually sits behind a TLS-terminating proxy, so the request itself
                // looks like plain HTTP); browsers ignore it over HTTP, so local development is unaffected.
                .headers(h -> h
                        .contentSecurityPolicy(c -> c.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
                        .referrerPolicy(r -> r.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .httpStrictTransportSecurity(s -> s.requestMatcher(org.springframework.security.web.util.matcher.AnyRequestMatcher.INSTANCE)
                                .maxAgeInSeconds(31_536_000)))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/auth/login", "/api/auth/employee-login", "/api/public/**", "/error").permitAll()
                        .requestMatchers("/api/hr/**").hasAnyRole("HR", "ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                    res.setStatus(401);
                    res.setContentType("application/json");
                    res.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"Sign in required\"}");
                }))
                .addFilterBefore(tokenFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProps props) {
        CorsConfiguration c = new CorsConfiguration();
        c.setAllowedOrigins(List.of(props.corsOrigins().split(",")));
        c.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        c.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource s = new UrlBasedCorsConfigurationSource();
        s.registerCorsConfiguration("/**", c);
        return s;
    }

    /** Resolves a caller from a Bearer JWT or an X-Device-Token (paired app). */
    @org.springframework.stereotype.Component
    public static class TokenFilter extends OncePerRequestFilter {
        private final JwtService jwt;
        private final JdbcClient db;
        private final AppProps props;

        public TokenFilter(JwtService jwt, JdbcClient db, AppProps props) {
            this.jwt = jwt;
            this.db = db;
            this.props = props;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            Actor actor = null;
            String auth = req.getHeader("Authorization");
            String dev = req.getHeader("X-Device-Token");
            if (auth != null && auth.startsWith("Bearer ")) {
                actor = jwt.parse(auth.substring(7));

            } else if (dev != null && !dev.isBlank()) {
                actor = db.sql("""
                        SELECT e.id AS employee_id, e.role AS role, t.device_id AS device_id
                        FROM app_tokens t JOIN employees e ON e.id = t.employee_id
                        JOIN user_devices d ON d.id = t.device_id
                        WHERE t.token_hash = ? AND t.revoked_at IS NULL AND e.active = TRUE AND d.status = 'APPROVED'
                        """).param(Crypto.sha256(dev)).query(Actor.class).optional().orElse(null);
            }
            if (actor != null) {
                // One lookup for both ways of signing in. The role comes from the database, not from the token: a login token is
                // valid for days, and someone demoted or deactivated must lose access at once. An account that still has the
                // default password may only read its own profile and change its password.
                String[] state = db.sql("SELECT must_change_password, role FROM employees WHERE id = ? AND active = TRUE")
                        .param(actor.employeeId()).query((rs, n) -> new String[]{String.valueOf(rs.getBoolean(1)), rs.getString(2)}).optional().orElse(null);
                if (state == null) {
                    actor = null;
                } else {
                    actor = new Actor(actor.employeeId(), state[1], actor.deviceId());
                    if ("true".equals(state[0]) && props.enforcePasswordChange() && !allowedWhileChangingPassword(req)) {
                        res.setStatus(403);
                        res.setContentType("application/json");
                        res.getWriter().write("{\"code\":\"PASSWORD_CHANGE_REQUIRED\",\"message\":\"Set a new password before continuing\"}");
                        return;
                    }
                }
            }
            if (actor != null) {
                var token = new UsernamePasswordAuthenticationToken(actor, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + actor.role())));
                SecurityContextHolder.getContext().setAuthentication(token);
            }
            chain.doFilter(req, res);
        }

        private static boolean allowedWhileChangingPassword(HttpServletRequest req) {
            String uri = req.getRequestURI();
            return ("GET".equals(req.getMethod()) && "/api/me".equals(uri)) || ("POST".equals(req.getMethod()) && "/api/me/password".equals(uri));
        }
    }
}
