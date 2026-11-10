package com.arudra.attendance.service;

import com.arudra.attendance.config.AppProps;
import com.arudra.attendance.model.M;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Scheduled checks and first-run admin seeding. Notifications are logged; wire email/push where you need it. */
@Component
public class Jobs implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(Jobs.class);

    private final TimeService time;
    private final FaceRequestService faceRequests;
    private final JdbcClient db;
    private final PasswordEncoder encoder;
    private final AppProps props;

    public Jobs(TimeService time, FaceRequestService faceRequests, JdbcClient db, PasswordEncoder encoder, AppProps props) {
        this.time = time;
        this.faceRequests = faceRequests;
        this.db = db;
        this.encoder = encoder;
        this.props = props;
    }

    @Scheduled(cron = "0 15 * * * *")
    public void flagMissedCheckouts() {
        int n = time.flagMissedCheckouts();
        if (n > 0) log.warn("Flagged {} open past-day session(s) as 'No check-out' for HR", n);
    }

    @Scheduled(cron = "0 */30 * * * *")
    public void alertLongOpenSessions() {
        for (M.Session s : time.longOpenSessions(14)) {
            log.warn("Session {} for employee {} has been open since {}", s.id(), s.employeeId(), s.clockIn());
        }
    }

    @Scheduled(cron = "0 0 3 * * *")
    public void purgeOldPhotos() {
        int n = faceRequests.purgeOld();
        if (n > 0) log.info("Deleted {} decided photo request(s) older than 30 days", n);
    }

    @Override
    public void run(ApplicationArguments args) {
        Integer count = db.sql("SELECT COUNT(*) FROM employees").query(Integer.class).single();
        if (count > 0) return;
        db.sql("INSERT INTO employees (employee_code, name, email, password_hash, role) VALUES ('ADMIN', 'Administrator', ?, ?, 'ADMIN')")
                .param(props.seedAdminEmail()).param(encoder.encode(props.seedAdminPassword())).update();
        log.warn("Seeded admin account {}. Change its password before any real use.", props.seedAdminEmail());
    }
}
