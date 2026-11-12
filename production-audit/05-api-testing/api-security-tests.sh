B=${B:-localhost:8090}
RES="${RES:-api-run-raw.tsv}"; : > "$RES"
n=0
req(){ local m=$1 p=$2 t=$3 d=$4; shift 4
  local args=(-s -o /tmp/body -w "%{http_code}" -X "$m" "$B$p" -H 'content-type: application/json' "$@")
  [ -n "$t" ] && args+=(-H "Authorization: Bearer $t")
  [ -n "$d" ] && args+=(-d "$d")
  CODE=$(curl "${args[@]}"); BODY=$(cat /tmp/body); }
chk(){ n=$((n+1)); local ok=FAIL; [[ "$CODE" =~ ^($3)$ ]] && ok=PASS
  [ -n "$4" ] && echo "$BODY" | grep -qiE "$4" && ok=FAIL   # $4 = regex that must NOT appear in body
  printf "A%02d\t%s\t%s\texp=%s\tgot=%s\t%s\t%s\n" $n "$1" "$2" "$3" "$CODE" "$ok" "$(echo "$BODY" | head -c 100 | tr '\t\n' '  ')" >> "$RES"; }
tok(){ echo "$BODY" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
jid(){ echo "$BODY" | sed -E 's/.*"id":([0-9]+)[^0-9].*/\1/'; }
b64(){ printf '%s' "$1" | openssl base64 -A | tr '+/' '-_' | tr -d '='; }

req POST /api/auth/login "" '{"email":"audit@test.local","password":"AuditPass#2026"}'; A=$(tok); echo "$A" > admin-token.txt
# fresh employees for isolation
mk(){ req POST /api/hr/employees "$A" "{\"employeeCode\":\"$1\",\"email\":\"$1@t.local\",\"name\":\"$1\",\"phone\":\"$2\",\"password\":\"Emp#1234\",\"role\":\"EMPLOYEE\",\"hourlyRate\":100}"; }
mk P101 9100000101; ID1=$(jid); mk P102 9100000102; ID2=$(jid)
req POST /api/auth/employee-login "" '{"employeeCode":"P101","phone":"9100000101","password":"Emp#1234"}'; T1=$(tok)
req POST /api/auth/employee-login "" '{"employeeCode":"P102","phone":"9100000102","password":"Emp#1234"}'; T2=$(tok)
# HR role (non-admin) account
req POST /api/hr/employees "$A" '{"employeeCode":"H1","email":"h1@t.local","name":"HR One","phone":"9100000111","password":"Emp#1234","role":"HR"}'
req POST /api/auth/login "" '{"email":"h1@t.local","password":"Emp#1234"}'; TH=$(tok)

echo "== IDOR / object-level authz"
req GET /api/hr/leave/types "$A" ""; LT=$(echo "$BODY" | sed -E 's/^\[\{"id":([0-9]+).*/\1/')
req POST /api/me/leave "$T1" "{\"leaveTypeId\":$LT,\"startDate\":\"2026-12-07\",\"endDate\":\"2026-12-07\",\"reason\":\"idor\"}"; LR=$(jid)
req POST /api/me/leave/$LR/cancel "$T2" ""; chk IDOR "Employee B cancels employee A's leave request" '403|404|400'
req GET /api/me/leave "$T2" ""; chk IDOR "Employee B's leave list does not include A's request" 200 'idor'
req GET /api/me/payslips "$T2" ""; chk IDOR "Employee B payslips contain no other employee names" 200 'P101'
req GET "/api/me/timesheet?month=2026-10&employeeId=$ID1" "$T2" ""; chk IDOR "employeeId query param on /me/timesheet ignored (returns B's own data)" 200
req GET /api/hr/employees/$ID1/pay "$T2" ""; chk IDOR "Employee reads another employee's pay settings" '403'
req PUT /api/hr/employees/$ID1/pay "$T2" '{"payMode":"MONTHLY","allowances":999999}'; chk IDOR "Employee edits pay settings" '403'
req GET /api/hr/leave/balances/$ID1 "$T2" ""; chk IDOR "Employee reads another's leave balances" '403'
req POST /api/hr/leave/requests/$LR/approve "$T2" ""; chk IDOR "Employee approves leave (privilege escalation)" '403'
req POST /api/me/password "$T2" "{\"employeeId\":$ID1,\"currentPassword\":\"Emp#1234\",\"newPassword\":\"Hacked#1234\"}"; chk IDOR "Password change with foreign employeeId in body" '200|400'
req POST /api/auth/employee-login "" '{"employeeCode":"P101","phone":"9100000101","password":"Hacked#1234"}'; chk IDOR "Employee A's password NOT changed by B's request" 401
req POST /api/hr/employees "$T2" '{"employeeCode":"X1","email":"x@t.local","name":"x","phone":"9100000999","password":"Emp#1234","role":"ADMIN"}'; chk Privilege "Employee creates an ADMIN" '403'
req PUT /api/hr/employees/$ID2 "$T2" "{\"employeeCode\":\"P102\",\"name\":\"P102\",\"role\":\"ADMIN\"}"; chk Privilege "Employee promotes self to ADMIN" '403'
req GET /api/hr/employees "$TH" ""; chk Privilege "HR role can list employees" 200
req POST /api/hr/employees "$TH" '{"employeeCode":"X2","email":"x2@t.local","name":"x2","phone":"9100000998","password":"Emp#1234","role":"ADMIN"}'; chk Privilege "HR (non-admin) creates an ADMIN account" '403' '"role":"ADMIN"'
req POST /api/hr/employees "$A" '{"employeeCode":"ADM2","email":"adm2@t.local","name":"Second Admin","phone":"9100000112","password":"Emp#1234","role":"ADMIN"}'; ADM2=$(jid)
req PUT /api/hr/employees/$ADM2 "$TH" "{\"employeeCode\":\"ADM2\",\"name\":\"Second Admin\",\"email\":\"adm2@t.local\",\"role\":\"EMPLOYEE\",\"active\":false}"; chk Privilege "HR demotes and deactivates another ADMIN" 403
req POST /api/hr/employees/1/face "$T2" '{"descriptors":[]}'; chk Privilege "Employee enrols face for ADMIN via HR route" '403'

echo "== JWT"
H=$(b64 '{"alg":"none","typ":"JWT"}'); P=$(b64 '{"sub":"1","role":"ADMIN","iat":1794376000,"exp":1996968000}')
req GET /api/hr/employees "$H.$P." ""; chk JWT "alg=none token for admin" 401
req GET /api/hr/employees "$H.$P" ""; chk JWT "alg=none, no trailing dot" 401
GOODP=${T1#*.}; GOODP=${GOODP%%.*}
req GET /api/hr/employees "$(b64 '{"alg":"HS256","typ":"JWT"}').$P.AAAA" ""; chk JWT "Admin claims with bogus signature" 401
req GET /api/me "$T1" ""; chk JWT "Valid token still works (control)" 200
req GET /api/hr/employees "${T1%.*}.$(b64 '{"sub":"1","role":"ADMIN","exp":1996968000}')" ""; chk JWT "Valid header + tampered payload + wrong sig" 401
req GET /api/me "Bearer" ""; chk JWT "Authorization header 'Bearer' with no token" 401
curl -s -o /tmp/body -w "%{http_code}" -H "Authorization: Basic YXVkaXQ6eA==" $B/api/me > /tmp/c; CODE=$(cat /tmp/c); BODY=""; chk JWT "Basic auth header rejected" 401
# token signed with the public default dev secret must NOT work on a properly configured instance
FORGED=$(node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=b({alg:'HS256'}),p=b({sub:'1',role:'ADMIN',iat:1794376000,exp:1996968000});const s=c.createHmac('sha256','dev-only-secret-change-me-dev-only-secret-change-me').update(h+'.'+p).digest('base64url');console.log(h+'.'+p+'.'+s)")
req GET /api/hr/employees "$FORGED" ""; chk JWT "Admin token forged with public default secret (instance has custom secret)" 401
echo "$FORGED" > forged-token.txt

echo "== Input handling / injection"
req POST /api/auth/login "" "{\"email\":\"admin' OR '1'='1\",\"password\":\"x\"}"; chk SQLi "SQL injection in login email" 401
req POST /api/auth/login "" "{\"email\":\"audit@test.local\",\"password\":\"' OR '1'='1\"}"; chk SQLi "SQL injection in login password" 401
req POST /api/auth/employee-login "" "{\"employeeCode\":\"P101' OR 1=1 --\",\"phone\":\"x\",\"password\":\"x\"}"; chk SQLi "SQL injection in employee code" 401
req GET "/api/hr/attendance/register?date=2026-10-05'%20OR%201=1--" "$A" ""; chk SQLi "SQL injection in date param" '400' 'exception|sql|at com\.'
req GET "/api/me/timesheet?month=2026-10';DROP%20TABLE%20employees;--" "$T1" ""; chk SQLi "Stacked query in month param" '400' 'exception|sql|at com\.'
req POST /api/auth/login "" '{"email":'; chk Input "Malformed JSON" 400 'exception|at com\.|org\.springframework'
req POST /api/auth/login "" '[]'; chk Input "JSON array instead of object" '400|401' 'exception|at com\.|org\.springframework'
req POST /api/auth/login "" 'email=a&password=b'; chk Input "Form body with JSON content type" '400|401' 'exception|at com\.|org\.springframework'
curl -s -o /tmp/body -w "%{http_code}" -X POST $B/api/auth/login -H 'content-type: text/plain' -d 'x' > /tmp/c; CODE=$(cat /tmp/c); BODY=$(cat /tmp/body); chk Input "Wrong content-type on login" '400|401|415'
req DELETE /api/hr/employees/1 "$A" ""; chk Method "DELETE on employee (no such route)" '404|405|403'
req GET /api/hr/nope "$A" ""; chk Method "Unknown HR route" '404' 'exception|at com\.'
req GET /actuator "" ""; chk Exposure "/actuator not exposed" '401|403|404'
req GET /h2-console "" ""; chk Exposure "/h2-console not exposed" '401|403|404'
req GET /api/public/../hr/employees "" ""; chk Exposure "Path traversal into HR via public path" '401|404|400'
req GET "/api/hr/employees%2e%2e/..%2f" "$A" ""; chk Exposure "Encoded traversal" '400|404|401|403'
BIG=$(head -c 3000000 /dev/zero | tr '\0' 'A')
curl -s -o /tmp/body -w "%{http_code}" -X POST $B/api/me/punch/in -H "Authorization: Bearer $T1" -H 'content-type: application/json' -d "{\"photo\":\"$BIG\",\"confirm\":true,\"note\":\"x\"}" > /tmp/c; CODE=$(cat /tmp/c); BODY=$(cat /tmp/body); chk Input "3 MB photo in punch body (README says photos must be < 300 KB)" '400|413|422'
req POST /api/hr/employees "$A" "{\"employeeCode\":\"LONG\",\"email\":\"l@t.local\",\"name\":\"$(head -c 5000 /dev/zero | tr '\0' 'N')\",\"phone\":\"9100000500\",\"password\":\"Emp#1234\"}"; chk Input "5,000-character name" '400'
req POST /api/hr/employees "$A" '{"employeeCode":"XSS1","email":"x1@t.local","name":"<img src=x onerror=alert(1)>","phone":"9100000501","password":"Emp#1234"}'; chk XSS "HTML in name is stored (frontend must escape; see UI note)" '200|201|400'
req POST /api/hr/payroll/generate "$A" '{"period":"9999-99","mode":"MONTHLY"}'; chk Input "Impossible period 9999-99" 400
req POST /api/hr/payroll/generate "$A" '{"period":"2026-10","mode":"BOGUS"}'; chk Input "Unknown payroll mode" '400|409'
req POST /api/hr/payroll/payslips/1/adjust "$A" '{"amount":999999999999999}'; chk Input "Absurd payroll adjustment amount" '400'
req POST /api/hr/payroll/payslips/1/adjust "$A" '{"amount":"abc"}'; chk Input "Non-numeric adjustment" 400
req POST /api/hr/payroll/payslips/999999/adjust "$A" '{"amount":1}'; chk Input "Adjust nonexistent payslip" '404|400'

echo "== CORS"
cors=$(curl -s -D - -o /dev/null -X OPTIONS $B/api/hr/employees -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' | tr -d '\r')
CODE=$(echo "$cors" | head -1 | awk '{print $2}'); BODY="$(echo "$cors" | grep -i access-control || echo none)"; chk CORS "Preflight from https://evil.example gets no allow-origin" '403|200' 'evil\.example'
cors=$(curl -s -D - -o /dev/null $B/api/public/config -H 'Origin: http://localhost:5173' | tr -d '\r'); CODE=200; BODY="$(echo "$cors" | grep -i access-control-allow-origin || echo none)"; chk CORS "Configured origin is allowed" 200 'none'
CODE=$([ "$(echo "$BODY" | grep -c 'localhost:5173')" -ge 1 ] && echo 200 || echo 0); BODY="allow-origin check"; chk CORS "Allow-origin echoes only the configured origin" 200

echo "== Rate limiting / lockout"
for i in 1 2 3 4 5 6; do req POST /api/auth/employee-login "" '{"employeeCode":"P102","phone":"9100000102","password":"bad"}'; done; chk Throttle "6th bad login for same ID locks (429)" 429
req POST /api/auth/employee-login "" '{"employeeCode":"P102","phone":"9100000102","password":"Emp#1234"}'; chk Throttle "Correct password still refused while locked" 429
curl -s -o /tmp/body -w "%{http_code}" -X POST $B/api/auth/employee-login -H 'content-type: application/json' -H 'X-Forwarded-For: 10.9.9.9' -d '{"employeeCode":"P102","phone":"9100000102","password":"Emp#1234"}' > /tmp/c; CODE=$(cat /tmp/c); BODY=$(cat /tmp/body); chk Throttle "X-Forwarded-For spoof does not bypass lockout (trust-proxy=false)" 429
# admin email login throttle
for i in 1 2 3 4 5 6 7 8; do req POST /api/auth/login "" '{"email":"audit@test.local","password":"bad"}'; done; chk Throttle "Email login locks after repeated failures (HR/admin)" 429
DESC=$(node -e "console.log(Array.from({length:128},(_,i)=>(Math.sin(i)*0.5).toFixed(4)).join(\",\"))")
for i in $(seq 1 22); do curl -s -o /tmp/body -w "%{http_code}\n" -X POST $B/api/public/face-punch -H 'content-type: application/json' -d "{\"descriptor\":[$DESC]}" ; done > /tmp/fp; CODE=$(tail -1 /tmp/fp); BODY="$(sort /tmp/fp | uniq -c | tr '\n' ' ')"; chk Throttle "Face-punch: 22 unrecognised attempts end in 429 (limit 20/5min)" 429
req POST /api/public/face-punch "" '{}'; chk Input "Face punch with empty body does not 500" '400|422|429'
req POST /api/public/face-punch "" '{"descriptor":[]}'; chk Input "Face punch with empty descriptor does not 500" '400|422|429'
req POST /api/public/kiosk/punch "" '{}'; chk Auth "Kiosk punch without pairing token" '400|401|403'
req POST /api/public/app/pair "" '{"code":"000000","publicKey":"x","label":"x"}'; chk Auth "App pairing with bogus code" '400|401|403|404|429'
req POST /api/public/face-request "" '{"employeeCode":"P101","phone":"9100000101","action":"IN","photo":"notbase64"}'; chk Input "Face request with invalid photo" '400|422|429'

echo "== Headers"
hd=$(curl -s -D - -o /dev/null $B/api/public/config | tr -d '\r');
for h in "x-content-type-options" "x-frame-options" "cache-control" "strict-transport-security" "content-security-policy" "referrer-policy"; do
  if echo "$hd" | grep -qi "^$h:"; then CODE=200; else CODE=0; fi; BODY="$h"; chk Headers "Response header present: $h" 200; done
echo "$hd" | grep -iE "^server|x-powered" > hdr-leak.txt; CODE=200; BODY="$(cat hdr-leak.txt)"; chk Headers "No server/version banner" 200 'tomcat|spring|apache'
echo done $n
