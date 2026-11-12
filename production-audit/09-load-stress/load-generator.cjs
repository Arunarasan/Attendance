// Minimal load generator (no dependencies). Usage: node load.cjs <baseUrl> <adminToken> <scenarioSpec>
// scenarioSpec: "vus:seconds,vus:seconds,..."   Mixed workload per virtual user, with 100 ms think time.
const base = process.argv[2], adminToken = process.argv[3], spec = process.argv[4] || '1:10';
const think = Number(process.env.THINK_MS || 100);
const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

async function j(method, path, token, body) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, text: t };
}

async function makeUsers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const code = 'LT' + String(i).padStart(4, '0'), phone = '97' + String(i).padStart(8, '0');
    await j('POST', '/api/hr/employees', adminToken, { employeeCode: code, email: code.toLowerCase() + '@load.local', name: 'Load ' + i, phone, password: 'Load#12345', role: 'EMPLOYEE', hourlyRate: 100 });
    const r = await j('POST', '/api/auth/employee-login', null, { employeeCode: code, phone, password: 'Load#12345' });
    if (r.status === 200) out.push(JSON.parse(r.text).token);
  }
  return out;
}

const month = new Date().toISOString().slice(0, 7);
// weights: employee portal reads, HR reads, a punch in/out cycle
const actions = [
  [30, 'GET /api/me', (u) => j('GET', '/api/me', u.t)],
  [25, 'GET /api/me/today', (u) => j('GET', '/api/me/today', u.t)],
  [15, 'GET /api/me/timesheet', (u) => j('GET', '/api/me/timesheet?month=' + month, u.t)],
  [8, 'GET /api/hr/employees?limit=50', () => j('GET', '/api/hr/employees?limit=50', adminToken)],
  [6, 'GET /api/hr/attendance/pending/count', () => j('GET', '/api/hr/attendance/pending/count', adminToken)],
  [4, 'GET /api/hr/attendance/register', () => j('GET', '/api/hr/attendance/register?date=2026-11-09', adminToken)],
  [12, 'POST /api/me/punch (in/out)', async (u) => {
    const a = u.open ? 'out' : 'in';
    const r = await j('POST', '/api/me/punch/' + a, u.t, { lat: 12.97, lng: 77.59, accuracy: 20, confirm: true, note: 'load' });
    if (r.status === 200) u.open = !u.open;
    return r;
  }],
];
const total = actions.reduce((s, a) => s + a[0], 0);
const pick = () => { let x = Math.random() * total; for (const a of actions) { x -= a[0]; if (x <= 0) return a; } return actions[0]; };

async function scenario(vus, seconds, users) {
  const lat = [], errs = {}; let n = 0, bad = 0, sockErr = 0;
  const end = Date.now() + seconds * 1000;
  const t0 = Date.now();
  const workers = Array.from({ length: vus }, (_, i) => (async () => {
    const u = { t: users[i % users.length], open: false };
    while (Date.now() < end) {
      const [, name, fn] = pick();
      const s = performance.now();
      try {
        const r = await fn(u);
        const d = performance.now() - s; lat.push(d); n++;
        if (r.status >= 500 || (r.status >= 400 && r.status !== 409 && r.status !== 422)) { bad++; errs[name + ' -> ' + r.status] = (errs[name + ' -> ' + r.status] || 0) + 1; }
      } catch (e) { sockErr++; errs['socket: ' + (e.cause && e.cause.code || e.message)] = (errs['socket: ' + (e.cause && e.cause.code || e.message)] || 0) + 1; }
      if (think) await new Promise(r => setTimeout(r, think));
    }
  })());
  await Promise.all(workers);
  const secs = (Date.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const avg = lat.reduce((s, x) => s + x, 0) / (lat.length || 1);
  return { vus, seconds: Math.round(secs), requests: n, rps: +(n / secs).toFixed(1), avg: +avg.toFixed(0), p50: +pct(lat, .5).toFixed(0), p90: +pct(lat, .9).toFixed(0), p95: +pct(lat, .95).toFixed(0), p99: +pct(lat, .99).toFixed(0), max: +(lat[lat.length - 1] || 0).toFixed(0), errorRate: +(((bad + sockErr) / Math.max(1, n + sockErr)) * 100).toFixed(2), errs };
}

(async () => {
  const wanted = Math.min(100, Math.max(...spec.split(',').map(s => Number(s.split(':')[0]))));
  const users = await makeUsers(wanted);
  console.log('test users logged in:', users.length);
  console.log('vus | secs | reqs | rps | avg | p50 | p90 | p95 | p99 | max (ms) | error%');
  for (const part of spec.split(',')) {
    const [v, s] = part.split(':').map(Number);
    const r = await scenario(v, s, users);
    console.log([r.vus, r.seconds, r.requests, r.rps, r.avg, r.p50, r.p90, r.p95, r.p99, r.max, r.errorRate + '%'].join(' | '), Object.keys(r.errs).length ? JSON.stringify(r.errs) : '');
  }
})();
