package com.arudra.attendance.web;

import com.arudra.attendance.config.ApiException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> api(ApiException e) {
        Map<String, Object> body = new java.util.LinkedHashMap<>(e.data());
        body.put("code", e.code());
        body.put("message", e.getMessage());
        return ResponseEntity.status(e.status()).body(body);
    }

    /** A record that already exists (for example a race between two identical requests). */
    @ExceptionHandler(org.springframework.dao.DuplicateKeyException.class)
    ResponseEntity<Map<String, String>> duplicate(Exception e) {
        return ResponseEntity.status(409).body(Map.of("code", "CONFLICT", "message", "That record already exists"));
    }

    /** A value too long or out of range for its column: the caller's mistake, not a server fault. */
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> badValue(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("code", "BAD_REQUEST", "message", "A value is too long or out of range"));
    }

    /** A database lock conflict between two requests (MySQL deadlock) or no free database connection (overload): nothing was saved, trying again will work. */
    @ExceptionHandler({org.springframework.dao.PessimisticLockingFailureException.class, org.springframework.jdbc.CannotGetJdbcConnectionException.class,
            org.springframework.transaction.CannotCreateTransactionException.class})
    ResponseEntity<Map<String, String>> busy(Exception e) {
        return ResponseEntity.status(503).header("Retry-After", "1").body(Map.of("code", "BUSY", "message", "The server was busy. Please try again."));
    }

    @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
    ResponseEntity<Map<String, String>> wrongMethod(Exception e) {
        return ResponseEntity.status(405).body(Map.of("code", "METHOD_NOT_ALLOWED", "message", "That method is not allowed here"));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<Map<String, String>> badInput(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("code", "BAD_REQUEST", "message", "Invalid request"));
    }
}
