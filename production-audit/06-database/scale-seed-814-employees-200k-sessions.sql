SET SESSION cte_max_recursion_depth = 300000;
INSERT INTO employees (employee_code,name,email,phone,password_hash,role,hourly_rate,base_salary)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<800)
SELECT CONCAT('S',i), CONCAT('Seed Employee ',i), CONCAT('s',i,'@seed.local'), CONCAT('96',LPAD(i,8,'0')), '$2a$10$abcdefghijklmnopqrstuuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'EMPLOYEE', 100, 26000 FROM n;
INSERT INTO attendance_sessions (employee_id, work_date, clock_in, clock_out, source, verified, flagged, approval_status)
SELECT e.id, d.dt, TIMESTAMP(d.dt,'09:00:00'), TIMESTAMP(d.dt,'17:30:00'),'PORTAL',1,0,'APPROVED'
FROM employees e JOIN (WITH RECURSIVE x(k) AS (SELECT 0 UNION ALL SELECT k+1 FROM x WHERE k<249) SELECT DATE_SUB('2026-11-10', INTERVAL k DAY) dt FROM x) d
WHERE e.employee_code LIKE 'S%';
INSERT INTO attendance (employee_id, work_date, check_in, check_out, break_minutes, worked_minutes, overtime_minutes)
SELECT employee_id, work_date, clock_in, clock_out, 0, 510, 30 FROM attendance_sessions s WHERE NOT EXISTS (SELECT 1 FROM attendance a WHERE a.employee_id=s.employee_id AND a.work_date=s.work_date);
UPDATE attendance_sessions SET approval_status='PENDING', flagged=1, flag_reason='Not on the office network' WHERE work_date >= '2026-11-05' AND MOD(id,7)=0;
SELECT (SELECT COUNT(*) FROM employees) employees, (SELECT COUNT(*) FROM attendance_sessions) sessions, (SELECT COUNT(*) FROM attendance) days, (SELECT COUNT(*) FROM attendance_sessions WHERE approval_status='PENDING') pending;
