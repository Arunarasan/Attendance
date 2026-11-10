package com.arudra.attendance;

import com.arudra.attendance.model.M;
import com.arudra.attendance.service.CalendarService;
import com.arudra.attendance.service.DeductionService;
import com.arudra.attendance.service.PayrollService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.YearMonth;
import java.util.EnumSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PayrollCalcTest {
    private static final BigDecimal OT = new BigDecimal("1.5");

    private PayrollService.Calc calc(String mode, int reg, int ot, String rate, String base, int days) {
        return PayrollService.calculate(mode, reg, ot, new BigDecimal(rate), new BigDecimal(base), days, 8, OT);
    }

    @Test
    void hourlyPaysHoursTimesRatePlusOvertimeAtMultiplier() {
        var c = calc("HOURLY", 8 * 60, 120, "100", "0", 26);
        assertEquals(new BigDecimal("8.00"), c.regularHours());
        assertEquals(new BigDecimal("2.00"), c.overtimeHours());
        assertEquals(new BigDecimal("1100.00"), c.gross()); // 8*100 + 2*100*1.5
    }

    @Test
    void monthlyIsProRataAndCappedAtBase() {
        // base 26000 / (8 * 26) = 125 per hour
        assertEquals(new BigDecimal("13000.00"), calc("MONTHLY", 13 * 8 * 60, 0, "0", "26000", 26).gross());
        assertEquals(new BigDecimal("26000.00"), calc("MONTHLY", 30 * 8 * 60, 0, "0", "26000", 26).gross()); // capped
    }

    @Test
    void monthlyOvertimeIsPaidOnTopOfCap() {
        assertEquals(new BigDecimal("26187.50"), calc("MONTHLY", 26 * 8 * 60, 60, "0", "26000", 26).gross()); // 26000 + 1h * 125 * 1.5
    }

    @Test
    void overtimeMultiplierComesFromSettings() {
        var c = PayrollService.calculate("HOURLY", 0, 120, new BigDecimal("100"), BigDecimal.ZERO, 26, 8, new BigDecimal("2.0"));
        assertEquals(new BigDecimal("400.00"), c.gross());
    }

    @Test
    void scheduledDaysFollowTheWeeklyOffDays() {
        YearMonth oct = YearMonth.of(2026, 10); // 31 days: 4 Sundays, 5 Saturdays
        assertEquals(27, CalendarService.scheduledDaysIn(oct, EnumSet.of(DayOfWeek.SUNDAY)));
        assertEquals(22, CalendarService.scheduledDaysIn(oct, EnumSet.of(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY)));
        assertEquals(31, CalendarService.scheduledDaysIn(oct, EnumSet.noneOf(DayOfWeek.class)));
    }

    private M.DeductionRule rule(String name, String kind, String value, String cap, String min, String max, boolean active) {
        return new M.DeductionRule(0, name, kind, new BigDecimal(value), cap == null ? null : new BigDecimal(cap),
                min == null ? null : new BigDecimal(min), max == null ? null : new BigDecimal(max), active);
    }

    @Test
    void deductionRulesApplyWithCapsAndThresholds() {
        List<M.DeductionRule> rules = List.of(
                rule("PF", "PERCENT", "12", "15000", null, null, true),       // 12% of the first 15000
                rule("Cover", "PERCENT", "0.75", null, null, "21000", true),  // only up to 21000 gross
                rule("Tax", "FIXED", "200", null, "15000", null, true),       // only from 15000 gross
                rule("Off", "PERCENT", "50", null, null, null, false));        // inactive: ignored

        var high = DeductionService.apply(rules, new BigDecimal("30000"));
        assertEquals(new BigDecimal("2000.00"), high.total()); // 1800 PF + 200 tax; cover does not apply above 21000
        assertEquals("PF: 1800.00; Tax: 200.00", high.detail());

        var low = DeductionService.apply(rules, new BigDecimal("10000"));
        assertEquals(new BigDecimal("1275.00"), low.total()); // 1200 PF + 75 cover; no tax below 15000
    }

    @Test
    void deductionsNeverExceedWhatWasEarned() {
        var r = DeductionService.apply(List.of(rule("Big", "FIXED", "5000", null, null, null, true)), new BigDecimal("300"));
        assertEquals(new BigDecimal("300.00"), r.total());
    }
}
