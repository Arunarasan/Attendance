package com.arudra.attendance;

import com.arudra.attendance.service.PayrollService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Monthly salary paid by hours: salary covers (working days - free off days) x standard hours; short costs, extra earns. */
class HoursShortfallTest {
    private static final BigDecimal OT = new BigDecimal("1.5");
    private static final BigDecimal ZERO = BigDecimal.ZERO;

    // 30000 / 26 working days, 1 free day, 8 h days: 25 x 8 = 200 h required, 150 per hour
    private PayrollService.HoursCalc pay(int workedHours, int creditHours, boolean otEligible) {
        return PayrollService.calculateMonthlyHours(new BigDecimal("30000"), ZERO, 26, 1, 8, workedHours * 60, creditHours * 60, OT, otEligible);
    }

    @Test
    void requiredHoursAreWorkingDaysMinusFreeDayTimesStandardHours() {
        assertEquals(new BigDecimal("200.00"), pay(200, 0, true).requiredHours());
    }

    @Test
    void exactHoursPayTheFullSalary() {
        var c = pay(200, 0, true);
        assertEquals(new BigDecimal("30000.00"), c.gross());
        assertEquals(0, c.shortfallAmount().signum());
        assertEquals(0, c.extraAmount().signum());
    }

    @Test
    void takingTheFreeDayOffCostsNothing() {
        // 25 days x 8 h = 200 h: one of the 26 working days was the free day off
        assertEquals(new BigDecimal("30000.00"), pay(25 * 8, 0, true).gross());
    }

    @Test
    void fewerHoursCostTheMissingHoursAtTheHourlyRate() {
        var c = pay(190, 0, true); // 10 h short x 150
        assertEquals(new BigDecimal("10.00"), c.shortfallHours());
        assertEquals(new BigDecimal("1500.00"), c.shortfallAmount());
        assertEquals(new BigDecimal("28500.00"), c.gross());
    }

    @Test
    void workingEveryDayEarnsExtraAtTheOvertimeMultiplier() {
        var c = pay(26 * 8, 0, true); // 8 h over x 150 x 1.5
        assertEquals(new BigDecimal("8.00"), c.extraHours());
        assertEquals(new BigDecimal("1800.00"), c.extraAmount());
        assertEquals(new BigDecimal("31800.00"), c.gross());
    }

    @Test
    void peopleNotEligibleForOvertimeAreNotPaidExtra() {
        assertEquals(new BigDecimal("30000.00"), pay(26 * 8, 0, false).gross());
    }

    @Test
    void paidLeaveAndHolidayHoursCountAsWorked() {
        assertEquals(new BigDecimal("30000.00"), pay(184, 16, true).gross()); // 184 + 2 leave days = 200
    }

    @Test
    void noHoursAtAllLosesTheWholeSalaryButNeverMore() {
        var c = pay(0, 0, true);
        assertEquals(new BigDecimal("30000.00"), c.shortfallAmount());
        assertEquals(new BigDecimal("0.00"), c.gross());
    }

    @Test
    void allowancesArePaidInFull() {
        var c = PayrollService.calculateMonthlyHours(new BigDecimal("30000"), new BigDecimal("2000"), 26, 1, 8, 190 * 60, 0, OT, true);
        assertEquals(new BigDecimal("30500.00"), c.gross()); // 30000 - 1500 + 2000
    }

    @Test
    void zeroFreeDaysUsesAllWorkingDays() {
        var c = PayrollService.calculateMonthlyHours(new BigDecimal("31200"), ZERO, 26, 0, 8, 26 * 8 * 60, 0, OT, true);
        assertEquals(new BigDecimal("208.00"), c.requiredHours());
        assertEquals(new BigDecimal("31200.00"), c.gross());
    }
}
