package com.arudra.attendance;

import com.arudra.attendance.model.M;
import com.arudra.attendance.service.DayRulesService;
import com.arudra.attendance.service.DayRulesService.AttDay;
import com.arudra.attendance.service.DayRulesService.LeaveDay;
import com.arudra.attendance.service.PayrollService;
import com.arudra.attendance.service.PolicyService.Policy;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class PayRulesTest {
    private static final int STD = 480;

    private static Policy policy() {
        return new Policy("SCHEDULED", 0, 0, true, 10, 240, LocalTime.of(9, 0), 10, 3, 40, 25, 20, 15, 0, BigDecimal.ZERO);
    }

    // 2026-11-02 is a Monday; the week Mon-Sat is worked, Sunday is off.
    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    private static Map<LocalDate, AttDay> att(Object... pairs) {
        Map<LocalDate, AttDay> m = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 3) m.put(MON.plusDays((int) pairs[i]), new AttDay((int) pairs[i + 1], (LocalTime) pairs[i + 2]));
        return m;
    }

    private static DayRulesService.Month run(int days, Map<LocalDate, AttDay> a, Map<LocalDate, LeaveDay> leave, Map<LocalDate, M.Holiday> hol, Policy p) {
        return DayRulesService.evaluate(MON, MON.plusDays(days - 1), STD, p, Set.of(DayOfWeek.SUNDAY), hol, leave, a, Map.of());
    }

    @Test void fullDayWithinGraceIsNotPenalised() {
        // 7h55 worked is within the 10 minute grace of 8h
        var m = run(1, att(0, 475, LocalTime.of(9, 0)), Map.of(), Map.of(), policy());
        assertEquals("FULL", m.days().get(0).status());
        assertEquals(0, m.lopDays());
    }

    @Test void halfDayAndShortAndAbsent() {
        var m = run(3, att(0, 300, LocalTime.of(9, 0), 1, 120, LocalTime.of(9, 0)), Map.of(), Map.of(), policy());
        assertEquals("HALF", m.days().get(0).status());
        assertEquals("SHORT", m.days().get(1).status());
        assertEquals("ABSENT", m.days().get(2).status());
        assertEquals(0.5 + 1 + 1, m.lopDays());
    }

    @Test void weeklyOffHolidayAndLeaveCostNothingWhenPaid() {
        Map<LocalDate, M.Holiday> hol = Map.of(MON.plusDays(1), new M.Holiday(1, MON.plusDays(1), "Fest", true));
        Map<LocalDate, LeaveDay> leave = Map.of(MON.plusDays(2), new LeaveDay(true, false));
        var m = run(7, att(0, 480, LocalTime.of(9, 0), 3, 480, LocalTime.of(9, 0), 4, 480, LocalTime.of(9, 0), 5, 480, LocalTime.of(9, 0)), leave, hol, policy());
        assertEquals(0, m.lopDays());
        assertEquals("OFF", m.days().get(6).status());
        assertEquals("HOLIDAY", m.days().get(1).status());
        assertEquals("LEAVE", m.days().get(2).status());
    }

    @Test void unpaidLeaveAndUnpaidHolidayCountAsLossOfPay() {
        Map<LocalDate, M.Holiday> hol = Map.of(MON, new M.Holiday(1, MON, "Unpaid fest", false));
        Map<LocalDate, LeaveDay> leave = Map.of(MON.plusDays(1), new LeaveDay(false, false), MON.plusDays(2), new LeaveDay(false, true));
        var m = run(3, Map.of(), leave, hol, policy());
        assertEquals(1 + 1 + 0.5, m.lopDays());
    }

    @Test void everyThirdLateArrivalCostsAHalfDay() {
        var a = att(0, 480, LocalTime.of(9, 30), 1, 480, LocalTime.of(9, 20), 2, 480, LocalTime.of(9, 45), 3, 480, LocalTime.of(9, 5));
        var m = run(4, a, Map.of(), Map.of(), policy());
        assertEquals(3, m.lateDays());        // 09:05 is inside the 10 minute grace
        assertEquals(0.5, m.lopDays());
        assertEquals(30, m.days().get(0).lateMinutes());
    }

    @Test void hrOverrideReplacesTheDay() {
        var m = DayRulesService.evaluate(MON, MON, STD, policy(), Set.of(), Map.of(), Map.of(), Map.of(), Map.of(MON, new BigDecimal("0.0")));
        assertEquals(0, m.lopDays());
        assertTrue(m.days().get(0).overridden());
    }

    @Test void scoreWeightsAndLevels() {
        var perfect = DayRulesService.score(run(2, att(0, 480, LocalTime.of(9, 0), 1, 480, LocalTime.of(9, 0)), Map.of(), Map.of(), policy()), policy(), 0, 0);
        assertEquals(100, perfect.score());
        assertEquals("GOLD", perfect.level());

        // two required days: one full (late), one absent -> attendance 50, punctuality 0, hours 100, discipline 80
        var mixed = DayRulesService.score(run(2, att(0, 480, LocalTime.of(10, 0)), Map.of(), Map.of(), policy()), policy(), 1, 1);
        assertEquals(Integer.valueOf((int) Math.round((50 * 40 + 0 * 25 + 100 * 20 + 80 * 15) / 100.0)), mixed.score());

        var none = DayRulesService.score(run(1, Map.of(), Map.of(), Map.of(MON, new M.Holiday(1, MON, "H", true)), policy()), policy(), 0, 0);
        assertNull(none.score());
        assertEquals("NO_DATA", none.level());
    }

    @Test void workingDaysBasisAndOvertimeRules() {
        YearMonth ym = YearMonth.of(2026, 11);
        assertEquals(26, PayrollService.workingDays("SCHEDULED", ym, 26));
        assertEquals(30, PayrollService.workingDays("CALENDAR", ym, 26));
        assertEquals(26, PayrollService.workingDays("FIXED_26", ym, 24));
        assertEquals(30, PayrollService.workingDays("FIXED_30", ym, 24));
        assertEquals(0, PayrollService.effectiveOvertime(20, 30, 0));
        assertEquals(30, PayrollService.effectiveOvertime(60, 30, 0));
        assertEquals(45, PayrollService.effectiveOvertime(120, 30, 45));
    }

    @Test void monthlyLossOfPayRemovesADaysPayPerLopDay() {
        // base 26000 over 26 days = 1000 a day; 2 LOP days = 24000; allowances 2600 shrink by 2/26
        var c = PayrollService.calculateMonthlyLop(new BigDecimal("26000"), new BigDecimal("2600"), 2, 26, 0, 8, new BigDecimal("1.5"), true);
        assertEquals(new BigDecimal("24000.00").add(new BigDecimal("2600").multiply(new BigDecimal(24)).divide(new BigDecimal(26), 2, java.math.RoundingMode.HALF_UP)), c.gross());
        assertEquals(new BigDecimal("2200.00"), PayrollService.lopAmount(new BigDecimal("26000"), new BigDecimal("2600"), 2, 26));
    }

    @Test void overtimeIsPaidOnlyWhenEligible() {
        var yes = PayrollService.calculateMonthlyLop(new BigDecimal("26000"), BigDecimal.ZERO, 0, 26, 120, 8, new BigDecimal("1.5"), true);
        var no = PayrollService.calculateMonthlyLop(new BigDecimal("26000"), BigDecimal.ZERO, 0, 26, 120, 8, new BigDecimal("1.5"), false);
        // rate = 26000 / (8 x 26) = 125 an hour; 2 hours at 1.5x = 375
        assertEquals(new BigDecimal("26375.00"), yes.gross());
        assertEquals(new BigDecimal("26000.00"), no.gross());
    }

    @Test void lossOfPayNeverGoesBelowZero() {
        var c = PayrollService.calculateMonthlyLop(new BigDecimal("26000"), BigDecimal.ZERO, 40, 26, 0, 8, new BigDecimal("1.5"), true);
        assertEquals(0, c.gross().compareTo(BigDecimal.ZERO));
    }
}
