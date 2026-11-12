package com.arudra.attendance.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Row / response shapes. */
public final class M {
    private M() {}

    public record Emp(long id, String employeeCode, String name, String email, String phone, String passwordHash,
                      String role, boolean active, BigDecimal hourlyRate, BigDecimal baseSalary,
                      String attendanceMethod, String deviceBindingMode) {}

    public record EmpView(long id, String employeeCode, String name, String email, String phone, String role,
                          boolean active, BigDecimal hourlyRate, BigDecimal baseSalary, String attendanceMethod,
                          String deviceBindingMode, boolean mustChangePassword) {}

    /** HR list row: the employee plus quick status flags for the Employees tab. */
    public record EmpRow(long id, String employeeCode, String name, String email, String phone, String role,
                         boolean active, BigDecimal hourlyRate, BigDecimal baseSalary, String attendanceMethod,
                         String deviceBindingMode, boolean faceEnrolled, boolean appPaired, boolean phoneApproved) {}

    public record Location(long id, String name, double latitude, double longitude, int radiusMeters, boolean active) {}

    public record Session(long id, long employeeId, LocalDate workDate, LocalDateTime clockIn, LocalDateTime clockOut,
                          LocalDateTime breakStarted, int breakMinutes, String source, String verificationMethod,
                          boolean verified, boolean flagged, String flagReason, Double distanceMeters,
                          Long deviceId, Boolean deviceVerified, Long kioskId, Double faceDistance,
                          String approvalStatus, Long approvedBy, LocalDateTime approvedAt, String employeeNote) {}

    public record PendingSession(long id, long employeeId, String employeeName, String employeeCode, LocalDate workDate,
                                 LocalDateTime clockIn, LocalDateTime clockOut, String source, String flagReason,
                                 Double distanceMeters, Double faceDistance, String employeeNote,
                                 boolean hasPhotoIn, boolean hasPhotoOut) {}

    public record Day(long employeeId, LocalDate workDate, LocalDateTime checkIn, LocalDateTime checkOut,
                      int breakMinutes, int workedMinutes, int overtimeMinutes) {}

    public record RegisterRow(long employeeId, String employeeName, String employeeCode, LocalDateTime checkIn,
                              LocalDateTime checkOut, Integer workedMinutes, Integer overtimeMinutes, String leaveType, String holiday) {}

    public record Correction(long id, long employeeId, LocalDate workDate, LocalDateTime originalIn,
                             LocalDateTime originalOut, LocalDateTime requestedIn, LocalDateTime requestedOut,
                             String reason, String status) {}

    public record CorrectionView(long id, long employeeId, String employeeName, LocalDate workDate,
                                 LocalDateTime originalIn, LocalDateTime originalOut, LocalDateTime requestedIn,
                                 LocalDateTime requestedOut, String reason, String status) {}

    public record Device(long id, long employeeId, String label, String status, LocalDateTime createdAt) {}

    public record DeviceKey(long id, String publicKey) {}

    public record Kiosk(long id, String name, String verifyMode, boolean active, boolean paired) {}

    public record Payslip(long id, long runId, long employeeId, String period, BigDecimal regularHours,
                          BigDecimal overtimeHours, BigDecimal gross, BigDecimal adjustments, BigDecimal net,
                          BigDecimal paidLeaveDays, BigDecimal unpaidLeaveDays, BigDecimal holidayDays, BigDecimal creditHours,
                          BigDecimal deductions, String deductionDetail, BigDecimal lopDays, BigDecimal lopAmount,
                          BigDecimal allowances, BigDecimal bonus, String payMode, Integer score,
                          String shortfallMethod, BigDecimal requiredHours, BigDecimal shortfallHours, BigDecimal shortfallAmount, BigDecimal extraHours, BigDecimal extraAmount) {}

    public record PayslipView(long id, long runId, long employeeId, String employeeName, String period,
                              BigDecimal regularHours, BigDecimal overtimeHours, BigDecimal gross,
                              BigDecimal adjustments, BigDecimal net, BigDecimal paidLeaveDays, BigDecimal unpaidLeaveDays,
                              BigDecimal holidayDays, BigDecimal creditHours, BigDecimal deductions, String deductionDetail,
                              BigDecimal lopDays, BigDecimal lopAmount, BigDecimal allowances, BigDecimal bonus, String payMode, Integer score,
                              String shortfallMethod, BigDecimal requiredHours, BigDecimal shortfallHours, BigDecimal shortfallAmount, BigDecimal extraHours, BigDecimal extraAmount) {}

    public record Holiday(long id, LocalDate holidayDate, String name, boolean paid) {}

    public record LeaveType(long id, String code, String name, boolean paid, BigDecimal annualQuota, boolean active) {}

    public record LeaveRequestView(long id, long employeeId, String employeeName, String employeeCode, long leaveTypeId,
                                   String leaveCode, String leaveName, boolean paid, LocalDate startDate, LocalDate endDate,
                                   boolean halfDay, BigDecimal days, String reason, String status, LocalDateTime createdAt) {}

    /** quota 0 means the type is not capped. remaining is null in that case. */
    public record LeaveBalance(long leaveTypeId, String code, String name, boolean paid, BigDecimal quota, BigDecimal used,
                               BigDecimal pending, BigDecimal remaining) {}

    public record DeductionRule(long id, String name, String kind, BigDecimal amount, BigDecimal wageCap, BigDecimal minGross,
                                BigDecimal maxGross, boolean active) {}

    public record FaceRequestView(long id, long employeeId, String employeeName, String employeeCode, String action,
                                  LocalDateTime requestedAt, String context, Double latitude, Double longitude) {}

    public record Run(long id, String period, String mode, LocalDateTime createdAt) {}
}
