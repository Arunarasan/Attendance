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

        public TokenFilter(JwtService jwt, JdbcClient db) {
            this.jwt = jwt;
            this.db = db;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            Actor actor = null;
            String auth = req.getHeader("Authorization");
            String dev = req.getHeader("X-Device-Token");
            if (auth != null && auth.startsWith("Bearer ")) {
                actor = jwt.parse(auth.substring(7));
                if (actor != null && !stillActive(actor.employeeId())) actor = null;
            } else if (dev != null && !dev.isBlank()) {
                actor = db.sql("""
                        SELECT e.id AS employee_id, e.role AS role, t.device_id AS device_id
                        FROM app_tokens t JOIN employees e ON e.id = t.employee_id
                        JOIN user_devices d ON d.id = t.device_id
                        WHERE t.token_hash = ? AND t.revoked_at IS NULL AND e.active = TRUE AND d.status = 'APPROVED'
                        """).param(Crypto.sha256(dev)).query(Actor.class).optional().orElse(null);
            }
            if (actor != null) {
                var token = new UsernamePasswordAuthenticationToken(actor, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + actor.role())));
                SecurityContextHolder.getContext().setAuthentication(token);
            }
            chain.doFilter(req, res);
        }

        private boolean stillActive(long id) {
            return db.sql("SELECT COUNT(*) FROM employees WHERE id = ? AND active = TRUE").param(id)
                    .query(Integer.class).single() > 0;
        }
    }
}
