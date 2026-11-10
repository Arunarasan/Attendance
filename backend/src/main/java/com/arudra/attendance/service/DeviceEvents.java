package com.arudra.attendance.service;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Own bean so REQUIRES_NEW applies: the audit row must commit even when the punch is refused and rolled back. */
@Component
public class DeviceEvents {
    private final JdbcClient db;

    public DeviceEvents(JdbcClient db) {
        this.db = db;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(long employeeId, Long deviceId, String event, String detail) {
        db.sql("INSERT INTO user_device_events (employee_id, device_id, event, detail) VALUES (?,?,?,?)")
                .param(employeeId).param(deviceId).param(event).param(detail).update();
    }
}
