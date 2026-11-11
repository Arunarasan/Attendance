package com.arudra.attendance.config;

import org.springframework.http.HttpStatus;

import java.util.Map;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> data;

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, Map.of());
    }

    public ApiException(HttpStatus status, String code, String message, Map<String, Object> data) {
        super(message);
        this.status = status;
        this.code = code;
        this.data = data;
    }

    /** Extra fields returned with the error, such as the list of failed checks. */
    public Map<String, Object> data() { return data; }

    public HttpStatus status() { return status; }
    public String code() { return code; }

    public static ApiException notFound(String what) { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found"); }
    public static ApiException conflict(String msg) { return new ApiException(HttpStatus.CONFLICT, "CONFLICT", msg); }
    /** A punch failed one or more checks. {@code issues} is the list of failed checks for the app to show. */
    public static ApiException checksFailed(String code, String message, java.util.List<?> issues) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, Map.of("issues", issues == null ? java.util.List.of() : issues));
    }
    public static ApiException bad(String msg) { return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", msg); }
}
