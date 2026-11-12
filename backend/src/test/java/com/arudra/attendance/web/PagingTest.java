package com.arudra.attendance.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;

/** Regression for the audit finding "list endpoints are unbounded". */
class PagingTest {
    private static final List<Integer> ALL = IntStream.range(0, 2500).boxed().toList();

    @Test
    void noParametersReturnsAtMostTheDefaultLimitAndReportsTheTotal() {
        MockHttpServletResponse res = new MockHttpServletResponse();
        List<Integer> page = Paging.of(ALL, null, null, res);
        assertEquals(1000, page.size());
        assertEquals(0, page.get(0));
        assertEquals("2500", res.getHeader("X-Total-Count"));
    }

    @Test
    void limitAndOffsetPickTheSlice() {
        MockHttpServletResponse res = new MockHttpServletResponse();
        List<Integer> page = Paging.of(ALL, 10, 100, res);
        assertEquals(List.of(100, 101, 102, 103, 104, 105, 106, 107, 108, 109), page);
        assertEquals("2500", res.getHeader("X-Total-Count"));
    }

    @Test
    void theLastPageIsShortAndPastTheEndIsEmpty() {
        assertEquals(5, Paging.of(ALL, 100, 2495, new MockHttpServletResponse()).size());
        assertTrue(Paging.of(ALL, 100, 5000, new MockHttpServletResponse()).isEmpty());
    }

    @Test
    void absurdLimitsAreClampedAndNegativeOffsetIsZero() {
        assertEquals(2500, Paging.of(ALL, 1_000_000, null, new MockHttpServletResponse()).size(), "clamped to the maximum of 5000, the list is shorter");
        assertEquals(1, Paging.of(ALL, 0, null, new MockHttpServletResponse()).size(), "limit below 1 becomes 1");
        assertEquals(0, Paging.of(ALL, 5, -7, new MockHttpServletResponse()).get(0));
    }

    @Test
    void smallListsAreReturnedWhole() {
        assertEquals(3, Paging.of(List.of(1, 2, 3), null, null, new MockHttpServletResponse()).size());
    }
}
