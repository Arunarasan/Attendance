B=localhost:8090
S=$(cat /tmp/scratch_path); cd "$S"
A=$(cat admin-token.txt)
J='content-type: application/json'
tok(){ sed -E 's/.*"token":"([^"]+)".*/\1/'; }
echo "== setup"
curl -s -o /dev/null -X POST $B/api/hr/employees -H "Authorization: Bearer $A" -H "$J" -d '{"employeeCode":"C1","email":"c1@t.local","name":"Conc One","phone":"9200000001","password":"Emp#1234","role":"EMPLOYEE","hourlyRate":100}'
T=$(curl -s -X POST $B/api/auth/employee-login -H "$J" -d '{"employeeCode":"C1","phone":"9200000001","password":"Emp#1234"}' | tok)
echo "== 12 parallel clock-in requests for one employee (expect exactly 1 open session)"
rm -f cin.*; for i in $(seq 1 12); do curl -s -o cin.$i -w "%{http_code}\n" -X POST $B/api/me/punch/in -H "Authorization: Bearer $T" -H "$J" -d '{"lat":12.97,"lng":77.59,"accuracy":20,"confirm":true,"note":"conc"}' > cin.code.$i & done; wait
cat cin.code.* | sort | uniq -c
curl -s "$B/api/me/timesheet?month=2026-11" -H "Authorization: Bearer $T" | grep -o '"clockIn"' | wc -l | sed 's/^/sessions stored: /'
echo "== 8 parallel payroll generate for same new month (expect 1x200, rest 409, 1 run)"
rm -f pg.*; for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/hr/payroll/generate -H "Authorization: Bearer $A" -H "$J" -d '{"period":"2026-09","mode":"MONTHLY"}' > pg.$i & done; wait
cat pg.* | sort | uniq -c
curl -s $B/api/hr/payroll/runs -H "Authorization: Bearer $A" | grep -o '"period":"2026-09"' | wc -l | sed 's/^/runs for 2026-09: /'
echo "== 8 parallel duplicate leave requests, same dates (expect 1 accepted)"
LT=$(curl -s $B/api/hr/leave/types -H "Authorization: Bearer $A" | sed -E 's/^\[\{"id":([0-9]+).*/\1/')
rm -f lv.*; for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/me/leave -H "Authorization: Bearer $T" -H "$J" -d "{\"leaveTypeId\":$LT,\"startDate\":\"2026-12-14\",\"endDate\":\"2026-12-14\",\"reason\":\"race\"}" > lv.$i & done; wait
cat lv.* | sort | uniq -c
curl -s $B/api/me/leave -H "Authorization: Bearer $T" | grep -o '"startDate":"2026-12-14"' | wc -l | sed 's/^/leave rows stored for that day: /'
echo "== 8 parallel duplicate employee code create (expect 1 created)"
rm -f ec.*; for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/hr/employees -H "Authorization: Bearer $A" -H "$J" -d '{"employeeCode":"RACE1","email":"race1@t.local","name":"Race","phone":"9200000777","password":"Emp#1234","role":"EMPLOYEE"}' > ec.$i & done; wait
cat ec.* | sort | uniq -c
curl -s $B/api/hr/employees -H "Authorization: Bearer $A" | grep -o '"employeeCode":"RACE1"' | wc -l | sed 's/^/RACE1 rows: /'
echo "== response times (30 sequential calls each, curl total seconds)"
pct(){ sort -n | awk '{a[NR]=$1} END{printf "n=%d p50=%.0fms p95=%.0fms max=%.0fms\n",NR,a[int(NR*0.5)+1]*1000,a[int(NR*0.95)]*1000,a[NR]*1000}'; }
for p in /api/me /api/me/today /api/hr/employees /api/hr/attendance/pending /api/hr/payroll/runs /api/hr/settings /api/public/config "/api/hr/attendance/register?date=2026-10-05"; do
  printf "%-48s " "$p"; for i in $(seq 1 30); do curl -s -o /dev/null -w "%{time_total}\n" -H "Authorization: Bearer $A" "$B$p"; done | pct; done
printf "%-48s " "POST /api/auth/login (bcrypt)"; for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{time_total}\n" -X POST $B/api/auth/employee-login -H "$J" -d '{"employeeCode":"C1","phone":"9200000001","password":"Emp#1234"}'; done | pct
