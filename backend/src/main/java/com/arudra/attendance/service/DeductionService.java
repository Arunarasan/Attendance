package com.arudra.attendance.service;

import com.arudra.attendance.config.ApiException;
import com.arudra.attendance.model.M;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Deductions are rules HR turns on. A rule is a percent or a fixed amount, optionally on wages up to a cap, and optionally
 * only when gross pay is at least / at most some amount (how many statutory deductions work). Rates are HR's to set and check.
 */
@Service
public class DeductionService {
    public record Applied(BigDecimal total, String detail) {}

    private final JdbcClient db;

    public DeductionService(JdbcClient db) {
        this.db = db;
    }

    public List<M.DeductionRule> rules() {
        return db.sql("SELECT id, name, kind, amount, wage_cap, min_gross, max_gross, active FROM deduction_rules ORDER BY id").query(M.DeductionRule.class).list();
    }

    public void add(M.DeductionRule r) {
        validate(r);
        db.sql("INSERT INTO deduction_rules (name, kind, amount, wage_cap, min_gross, max_gross, active) VALUES (?,?,?,?,?,?,?)")
                .param(r.name().trim()).param(r.kind()).param(r.amount()).param(r.wageCap()).param(r.minGross()).param(r.maxGross()).param(r.active()).update();
    }

    public void update(long id, M.DeductionRule r) {
        validate(r);
        int n = db.sql("UPDATE deduction_rules SET name = ?, kind = ?, amount = ?, wage_cap = ?, min_gross = ?, max_gross = ?, active = ? WHERE id = ?")
                .param(r.name().trim()).param(r.kind()).param(r.amount()).param(r.wageCap()).param(r.minGross()).param(r.maxGross()).param(r.active()).param(id).update();
        if (n == 0) throw ApiException.notFound("Deduction rule");
    }

    public void delete(long id) {
        db.sql("DELETE FROM deduction_rules WHERE id = ?").param(id).update();
    }

    static void validate(M.DeductionRule r) {
        if (r.name() == null || r.name().isBlank()) throw ApiException.bad("Name is required");
        if (!"PERCENT".equals(r.kind()) && !"FIXED".equals(r.kind())) throw ApiException.bad("Kind must be PERCENT or FIXED");
        if (r.amount() == null || r.amount().signum() < 0) throw ApiException.bad("Value must not be negative");
        if ("PERCENT".equals(r.kind()) && r.amount().compareTo(BigDecimal.valueOf(100)) > 0) throw ApiException.bad("A percentage cannot exceed 100");
        if (r.minGross() != null && r.maxGross() != null && r.minGross().compareTo(r.maxGross()) > 0) throw ApiException.bad("Minimum gross is above maximum gross");
    }

    /** What the active rules take from this gross pay. */
    public Applied apply(BigDecimal gross) {
        return apply(rules(), gross);
    }

    public static Applied apply(List<M.DeductionRule> rules, BigDecimal gross) {
        BigDecimal total = BigDecimal.ZERO;
        List<String> parts = new ArrayList<>();
        for (M.DeductionRule r : rules) {
            if (!r.active()) continue;
            if (r.minGross() != null && gross.compareTo(r.minGross()) < 0) continue;
            if (r.maxGross() != null && gross.compareTo(r.maxGross()) > 0) continue;
            BigDecimal amount;
            if ("FIXED".equals(r.kind())) {
                amount = r.amount();
            } else {
                BigDecimal base = r.wageCap() != null && r.wageCap().signum() > 0 ? gross.min(r.wageCap()) : gross;
                amount = base.multiply(r.amount()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            }
            amount = amount.setScale(2, RoundingMode.HALF_UP).min(gross); // never take more than was earned
            if (amount.signum() == 0) continue;
            total = total.add(amount);
            parts.add(r.name() + ": " + amount.toPlainString());
        }
        return new Applied(total.min(gross).setScale(2, RoundingMode.HALF_UP), String.join("; ", parts));
    }
}
