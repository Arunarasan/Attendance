package com.arudra.attendance;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class AttendanceApplication {
    /** Punch times, work dates and payroll days are all Indian Standard Time, whatever zone the host runs in (cloud hosts default to UTC). */
    static {
        TimeZone.setDefault(TimeZone.getTimeZone(System.getenv().getOrDefault("APP_TIMEZONE", "Asia/Kolkata")));
    }

    public static void main(String[] args) {
        SpringApplication.run(AttendanceApplication.class, args);
    }
}
