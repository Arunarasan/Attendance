package com.arudra.attendance;

import com.arudra.attendance.service.PayrollService;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression for the audit finding "an hourly employee on the monthly pay mode is paid 0 with no warning".
 * The preview must say so before HR generates the run.
 */
class PayWarningTest {
    private static String warn(String hourly, String base, String mode, String workedHours, boolean credit, String gross) throws Exception {
        Method m = PayrollService.class.getDeclaredMethod("payWarning", BigDecimal.class, BigDecimal.class, String.class, BigDecimal.class, boolean.class, BigDecimal.class);
        m.setAccessible(true);
        return (String) m.invoke(null, new BigDecimal(hourly), new BigDecimal(base), mode, new BigDecimal(workedHours), credit, new BigDecimal(gross));
    }

    @Test
    void hourlyRateOnlyButMonthlyMode_warnsAndNamesTheFix() throws Exception {
        String w = warn("100", "0", "MONTHLY", "8", false, "0");
        assertNotNull(w);
        assertTrue(w.contains("monthly") && w.contains("hourly rate"), w);
        assertTrue(w.contains("pay mode"), w);
    }

    @Test
    void monthlySalaryOnlyButHourlyMode_warns() throws Exception {
        assertNotNull(warn("0", "26000", "HOURLY", "8", false, "0"));
    }

    @Test
    void noRateAtAll_warns() throws Exception {
        String w = warn("0", "0", "HOURLY", "3", false, "0");
        assertNotNull(w);
        assertTrue(w.contains("No hourly rate"), w);
    }

    @Test
    void paidLeaveOrHolidayCreditAloneCountsAsWork() throws Exception {
        assertNotNull(warn("0", "0", "MONTHLY", "0", true, "0"));
    }

    @Test
    void noWarningWhenPayIsNonZero_orNothingWasWorked_orTheRightRateExists() throws Exception {
        assertNull(warn("100", "0", "HOURLY", "8", false, "800"), "paid normally");
        assertNull(warn("0", "0", "MONTHLY", "0", false, "0"), "no hours and no credit: nothing to pay, nothing to warn about");
        assertNull(warn("100", "0", "HOURLY", "8", false, "0"), "a rate exists (0 for another reason, such as unapproved hours): not a setup mistake");
    }
}
