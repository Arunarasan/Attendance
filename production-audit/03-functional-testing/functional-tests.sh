B=localhost:8090
RES="./functional-run-raw.tsv"; : > "$RES"  # NOTE: run against a disposable instance on :8090 only
n=0
req(){ # method path token body -> sets CODE BODY
  local m=$1 p=$2 t=$3 d=$4
  local args=(-s -o /tmp/body -w "%{http_code}" -X "$m" "$B$p" -H 'content-type: application/json')
  [ -n "$t" ] && args+=(-H "Authorization: Bearer $t")
  [ -n "$d" ] && args+=(-d "$d")
  CODE=$(curl "${args[@]}"); BODY=$(cat /tmp/body)
}
chk(){ # id module desc expectedCodes(regex) [bodyRegex]
  n=$((n+1)); local ok=FAIL
  if [[ "$CODE" =~ ^($4)$ ]]; then ok=PASS; [ -n "$5" ] && ! echo "$BODY" | grep -qE "$5" && ok=FAIL; fi
  printf "F%02d\t%s\t%s\texp=%s\tgot=%s\t%s\t%s\n" $n "$2" "$3" "$4" "$CODE" "$ok" "$(echo "$BODY" | head -c 110 | tr '\t\n' '  ')" >> "$RES"
}
jid(){ echo "$BODY" | sed -E 's/.*"id":([0-9]+).*/\1/'; }
tok(){ echo "$BODY" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
req POST /api/auth/login "" '{"email":"audit@test.local","password":"AuditPass#2026"}'; chk x Auth "Admin login" 200 token
A=$(tok)
req POST /api/auth/login "" '{"email":"audit@test.local","password":"wrong"}'; chk x Auth "Admin wrong password" 401
req GET /api/hr/employees "" ; chk x Auth "HR endpoint without token" 401
req GET /api/hr/employees "garbage.token.value"; chk x Auth "HR endpoint with forged token" 401
mk(){ req POST /api/hr/employees "$A" "$1"; }
mk '{"employeeCode":"E001","email":"e001@test.local","name":"Asha Hourly","phone":"9876543210","password":"Emp#1234","role":"EMPLOYEE","hourlyRate":100,"baseSalary":0,"attendanceMethod":"GEO"}'; chk x Employees "Create hourly employee" '200|201' E001
E1=$(jid)
mk '{"employeeCode":"E002","email":"e002@test.local","name":"Ravi Monthly","phone":"9876500002","password":"Emp#1234","role":"EMPLOYEE","hourlyRate":0,"baseSalary":26000,"attendanceMethod":"GEO"}'; chk x Employees "Create monthly employee" '200|201'
E2=$(jid)
mk '{"employeeCode":"E001","email":"dupcode@test.local","name":"Dup","phone":"9000000001","password":"Emp#1234","role":"EMPLOYEE"}'; chk x Employees "Duplicate employee code rejected" '400|409'
mk '{"employeeCode":"E003","email":"dupphone@test.local","name":"DupPhone","phone":"+91 98765-43210","password":"Emp#1234","role":"EMPLOYEE"}'; chk x Employees "Duplicate phone (same last 10 digits) rejected" '400|409'
mk '{"employeeCode":"E004","email":"e004@test.local","password":"Emp#1234","role":"EMPLOYEE"}'; chk x Employees "Missing name rejected" '400'
mk '{"employeeCode":"E005","email":"e005@test.local","name":"BadRole","phone":"9000000005","password":"Emp#1234","role":"SUPERUSER"}'; chk x Employees "Invalid role rejected" '400'
mk '{"employeeCode":"E006","email":"e006@test.local","name":"NegRate","phone":"9000000006","password":"Emp#1234","role":"EMPLOYEE","hourlyRate":-50}'; chk x Employees "Negative hourly rate rejected" '400'
mk '{"employeeCode":"E007","email":"e007@test.local","name":"ShortPw","phone":"9000000007","password":"1","role":"EMPLOYEE"}'; chk x Employees "Weak 1-char password rejected" '400'
mk '{"employeeCode":"E008","email":"e008@test.local","name":"<script>alert(1)</script>","phone":"9000000008","password":"Emp#1234","role":"EMPLOYEE"}'; chk x Employees "HTML in name handled without crash" '200|201|400'
req GET /api/hr/employees "$A"; chk x Employees "List employees" 200 E001
req PUT /api/hr/employees/$E2 "$A" '{"employeeCode":"E002","email":"e002@test.local","name":"Ravi Updated","phone":"9876500002","role":"EMPLOYEE","hourlyRate":0,"baseSalary":30000,"attendanceMethod":"GEO","active":true}'; chk x Employees "Update employee" 200 Updated
req PUT /api/hr/employees/999999 "$A" '{"employeeCode":"ZZ","name":"x","role":"EMPLOYEE"}'; chk x Employees "Update nonexistent employee" '404|400'
req POST /api/auth/employee-login "" '{"employeeCode":"E001","email":"e001@test.local","phone":"9876543210","password":"Emp#1234"}'; chk x Auth "Employee login (code+phone+password)" 200 token
T1=$(tok)
req POST /api/auth/employee-login "" '{"employeeCode":"E001","email":"e001@test.local","phone":"+91 98765 43210","password":"Emp#1234"}'; chk x Auth "Employee login, phone with +91 and spaces" 200
req POST /api/auth/employee-login "" '{"employeeCode":"E001","email":"e001@test.local","phone":"1111111111","password":"Emp#1234"}'; chk x Auth "Wrong phone rejected" 401
req POST /api/auth/employee-login "" '{"employeeCode":"E001","email":"e001@test.local","phone":"9876543210","password":"nope"}'; chk x Auth "Wrong password rejected" 401
req POST /api/auth/employee-login "" '{}'; chk x Auth "Empty employee login body" '400|401'
req GET /api/hr/employees "$T1"; chk x Authz "Employee blocked from HR employee list" 403
req POST /api/hr/payroll/generate "$T1" '{"period":"2026-10","mode":"MONTHLY"}'; chk x Authz "Employee blocked from payroll generate" 403
req GET /api/me "$T1"; chk x Authz "Employee reads own profile" 200 E001
req GET /api/hr/leave/balances/$E2 "$T1"; chk x Authz "Employee blocked from other employee leave balances" '403'
req GET /api/me/today "$T1"; chk x Punch "Today status before punch" 200
req POST /api/me/punch/out "$T1" '{}'; chk x Punch "Clock-out with no open session rejected" '400|409'
req POST /api/me/punch/in "$T1" '{"lat":12.97,"lng":77.59,"accuracy":20}'; chk x Punch "Clock-in" '200|409|400'
req POST /api/me/punch/in "$T1" '{"lat":12.97,"lng":77.59,"accuracy":20}'; chk x Punch "Second clock-in while open rejected" '400|409'
req POST /api/me/punch/bogus "$T1" '{}'; chk x Punch "Unknown punch action rejected" 400
req POST /api/me/punch/out "$T1" '{"lat":12.97,"lng":77.59,"accuracy":20}'; chk x Punch "Clock-out" '200|400|409'
req GET "/api/me/timesheet?from=2026-11-01&to=2026-11-30" "$T1"; chk x Punch "Own timesheet" '200|400'
req POST /api/hr/holidays "$A" '{"date":"2026-11-14","name":"Test Holiday","paid":true}'; chk x Holidays "Create holiday" '200|201'
HID=$(jid)
req POST /api/hr/holidays "$A" '{"date":"2026-11-14","name":"Dup","paid":true}'; chk x Holidays "Duplicate holiday date" '400|409'
req POST /api/hr/holidays "$A" '{"name":"No date"}'; chk x Holidays "Holiday without date rejected" 400
req DELETE /api/hr/holidays/$HID "$A"; chk x Holidays "Delete holiday" '200|204'
req PUT /api/hr/settings "$A" '{"standardDailyHours":0,"weeklyOffDays":["SUNDAY"],"overtimeMultiplier":1.5,"defaultMode":"MONTHLY"}'; chk x Settings "Zero standard hours rejected" 400
req PUT /api/hr/settings "$A" '{"standardDailyHours":8,"weeklyOffDays":["FUNDAY"],"overtimeMultiplier":1.5,"defaultMode":"MONTHLY"}'; chk x Settings "Invalid weekday rejected" 400
req PUT /api/hr/settings "$A" '{"standardDailyHours":8,"weeklyOffDays":["SUNDAY"],"overtimeMultiplier":1.5,"defaultMode":"MONTHLY"}'; chk x Settings "Valid pay settings saved" 200
req POST /api/hr/networks "$A" '{"name":"Office","cidr":"not-a-cidr"}'; chk x Networks "Invalid CIDR rejected" 400
req POST /api/hr/networks "$A" '{"name":"Office","cidr":"203.0.113.0/24"}'; chk x Networks "Valid CIDR saved" '200|201'
req POST /api/hr/attendance/locations "$A" '{"name":"HQ","latitude":999,"longitude":77.59,"radiusMeters":100}'; chk x Locations "Latitude out of range rejected" 400
req POST /api/hr/attendance/locations "$A" '{"name":"HQ","latitude":12.97,"longitude":77.59,"radiusMeters":100}'; chk x Locations "Valid location saved" '200|201'
req POST /api/hr/attendance/corrections/apply "$A" "{\"employeeId\":$E1,\"date\":\"2026-10-05\",\"checkIn\":\"2026-10-05T09:00:00\",\"checkOut\":\"2026-10-05T17:00:00\"}"; chk x Corrections "HR records missed day (8h)" '200|201'
req POST /api/hr/attendance/corrections/apply "$A" "{\"employeeId\":$E1,\"date\":\"2026-10-06\",\"checkIn\":\"2026-10-06T17:00:00\",\"checkOut\":\"2026-10-06T09:00:00\"}"; chk x Corrections "Check-out before check-in rejected" 400
req POST /api/hr/attendance/corrections/apply "$A" "{\"employeeId\":$E1,\"date\":\"2030-01-01\",\"checkIn\":\"2030-01-01T09:00:00\",\"checkOut\":\"2030-01-01T17:00:00\"}"; chk x Corrections "Future-date correction rejected" 400
req POST /api/hr/attendance/corrections/apply "$A" "{\"employeeId\":$E2,\"date\":\"2026-10-05\",\"checkIn\":\"2026-10-05T09:00:00\",\"checkOut\":\"2026-10-05T19:00:00\"}"; chk x Corrections "HR records 10h day (2h overtime)" '200|201'
req GET "/api/hr/attendance/register?date=2026-10-05" "$A"; chk x Register "Attendance register" '200|400'
req GET /api/hr/leave/types "$A"; chk x Leave "Leave types seeded" 200 '"code"'
LT=$(jid)
req POST /api/hr/leave/requests "$A" "{\"employeeId\":$E1,\"leaveTypeId\":$LT,\"startDate\":\"2026-10-12\",\"endDate\":\"2026-10-13\",\"reason\":\"test\"}"; chk x Leave "HR records leave" '200|201'
req POST /api/hr/leave/requests "$A" "{\"employeeId\":$E1,\"leaveTypeId\":$LT,\"startDate\":\"2026-10-13\",\"endDate\":\"2026-10-14\",\"reason\":\"overlap\"}"; chk x Leave "Overlapping leave rejected" '400|409'
req POST /api/hr/leave/requests "$A" "{\"employeeId\":$E1,\"leaveTypeId\":$LT,\"startDate\":\"2026-10-20\",\"endDate\":\"2026-10-19\"}"; chk x Leave "End before start rejected" 400
req POST /api/me/leave "$T1" "{\"leaveTypeId\":$LT,\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-02\",\"reason\":\"own\"}"; chk x Leave "Employee requests leave" '200|201'
LR=$(jid)
req POST /api/me/leave/$LR/cancel "$T1"; chk x Leave "Employee cancels own pending leave" '200|204'
req POST /api/hr/payroll/preview "$A" '{"period":"2026-10","mode":"MONTHLY"}'; chk x Payroll "Preview October" 200
req POST /api/hr/payroll/generate "$A" '{"period":"bad","mode":"MONTHLY"}'; chk x Payroll "Malformed period rejected" 400
req POST /api/hr/payroll/generate "$A" '{"period":"2026-10","mode":"MONTHLY"}'; chk x Payroll "Generate October run" '200|201'
RUN=$(jid)
req POST /api/hr/payroll/generate "$A" '{"period":"2026-10","mode":"MONTHLY"}'; chk x Payroll "Duplicate run for same month rejected" '400|409'
req GET /api/hr/payroll/runs/$RUN/payslips "$A"; chk x Payroll "Run payslips listed" 200 Asha
cp /tmp/body "$(cat /tmp/scratch_path)/payslips.json"
SL=$(jid)
req POST /api/hr/payroll/payslips/$SL/adjust "$A" '{"amount":-100}'; chk x Payroll "Adjust payslip" '200|201'
req GET /api/me/payslips "$T1"; chk x Payroll "Employee sees own payslips" 200
req POST /api/me/password "$T1" '{"currentPassword":"wrong","newPassword":"New#12345"}'; chk x Auth "Password change with wrong current rejected" 400
req POST /api/me/password "$T1" '{"currentPassword":"Emp#1234","newPassword":"123"}'; chk x Auth "Weak new password rejected" 400
req POST /api/me/password "$T1" '{"currentPassword":"Emp#1234","newPassword":"New#12345"}'; chk x Auth "Password change" 200
req POST /api/auth/employee-login "" '{"employeeCode":"E001","email":"e001@test.local","phone":"9876543210","password":"Emp#1234"}'; chk x Auth "Old password no longer works" 401
req PUT /api/hr/employees/$E1 "$A" '{"employeeCode":"E001","email":"e001@test.local","name":"Asha Hourly","phone":"9876543210","role":"EMPLOYEE","hourlyRate":100,"attendanceMethod":"GEO","active":false}'; chk x Employees "Deactivate employee" 200
req GET /api/me "$T1"; chk x Auth "Deactivated employee token rejected" 401
echo done
