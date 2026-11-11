import { useEffect, useMemo, useState } from 'react'
import { get } from '../lib/api'
import { useT } from '../lib/i18n'
import { IAlert, ICalCheck, ICalPlus, ICheckCircle, ICheckSq, IBars, IUmbrella, IUserPlus, IUsers, IArrowR } from '../components/icons'

type Row = { employeeId: number; checkIn: string | null; leaveType: string | null; holiday: string | null }
type Emp = { id: number; active: boolean }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const summarize = (rows: Row[]) => {
  const present = rows.filter(r => r.checkIn).length
  const leave = rows.filter(r => !r.checkIn && r.leaveType).length
  const absent = rows.filter(r => !r.checkIn && !r.leaveType && !r.holiday).length
  const base = present + leave + absent
  return { present, leave, absent, pct: base ? (present / base) * 100 : 0 }
}

function Trend({ pts }: { pts: { label: string; pct: number }[] }) {
  const W = 560, H = 230, L = 46, R = 14, T = 16, B = 30
  const lo = 80, hi = 100
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, pts.length - 1)
  const y = (v: number) => T + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - T - B)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(' ')
  const best = pts.reduce((b, p, i) => (p.pct > pts[b].pct ? i : b), 0)
  return (
    <svg className="dx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Attendance trend">
      <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4aa81f" stopOpacity=".28" /><stop offset="1" stopColor="#4aa81f" stopOpacity="0" /></linearGradient></defs>
      {[80, 85, 90, 95, 100].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e6ecdb" /><text x={L - 8} y={y(v) + 4} textAnchor="end">{v}%</text></g>)}
      {pts.length > 1 && <path d={`${path} L${x(pts.length - 1)} ${H - B} L${x(0)} ${H - B}Z`} fill="url(#trendFill)" />}
      <path d={path} fill="none" stroke="#287A3E" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.pct)} r="4.5" fill="#fff" stroke="#287A3E" strokeWidth="2" />)}
      {pts.map((p, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>)}
      {pts.length > 0 && (
        <g transform={`translate(${x(best)} ${y(pts[best].pct) - 14})`}>
          <rect x="-26" y="-22" width="52" height="22" rx="7" fill="#2f7d12" />
          <path d="M-5 0h10l-5 6z" fill="#2f7d12" />
          <text x="0" y="-7" textAnchor="middle" style={{ fill: '#fff', fontWeight: 600 }}>{pts[best].pct.toFixed(1)}%</text>
        </g>
      )}
    </svg>
  )
}

function Donut({ present, leave, absent }: { present: number; leave: number; absent: number }) {
  const total = present + leave + absent
  const r = 54, c = 2 * Math.PI * r
  const seg = [[present, '#287A3E'], [leave, '#f5c542'], [absent, '#f4a3a3']] as const
  let off = 0
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Today's attendance">
      <circle cx="75" cy="75" r={r} fill="none" stroke="#eef2e6" strokeWidth="18" />
      {total > 0 && seg.map(([n, col], i) => {
        const len = (n / total) * c
        const el = n > 0 ? <circle key={i} cx="75" cy="75" r={r} fill="none" stroke={col} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 75 75)" /> : null
        off += len
        return el
      })}
      <text x="75" y="76" textAnchor="middle" style={{ font: '700 22px Poppins, sans-serif', fill: '#174D2C' }}>{total ? ((present / total) * 100).toFixed(1) : '0'}%</text>
      <text x="75" y="95" textAnchor="middle" style={{ font: '13px Poppins, sans-serif', fill: '#5f7a63' }}>Present</text>
    </svg>
  )
}

export default function Dashboard({ go }: { go: (tab: string) => void }) {
  const { t: tr } = useT()
  const [emps, setEmps] = useState<Emp[]>([])
  const [days, setDays] = useState<{ date: Date; rows: Row[] }[]>([])
  const [pending, setPending] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    const dates = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (5 - i)); return d })
    Promise.all([
      get<Emp[]>('/api/hr/employees'),
      Promise.all(dates.map(d => get<Row[]>(`/api/hr/attendance/register?date=${ymd(d)}`).then(rows => ({ date: d, rows })))),
      get<{ count: number }>('/api/hr/attendance/pending/count'),
    ]).then(([e, d, p]) => { setEmps(e); setDays(d); setPending(p.count) }).catch(e => setErr(e.message))
  }, [])

  const todayRows = days.length ? days[days.length - 1].rows : []
  const t = useMemo(() => summarize(todayRows), [todayRows])
  const active = emps.filter(e => e.active).length
  const pts = days.map(d => ({ label: d.date.toLocaleDateString([], { weekday: 'short' }), pct: summarize(d.rows).pct }))

  return (<>
    {err && <div className="err">{err}</div>}
    <div className="dx-stats">
      <div className="dx-stat g1"><span className="ic"><IUsers size={26} /></span><div className="n">{active}</div><div className="l">{tr('h_totalEmp')}</div><div className="s">{emps.length - active > 0 ? `${emps.length - active} ${tr('h_inactive')}` : tr('h_allActive')}</div></div>
      <div className="dx-stat g2"><span className="ic"><ICheckCircle size={26} /></span><div className="n">{t.present}</div><div className="l">{tr('h_presentToday')}</div><div className="s">{t.pct.toFixed(1)}% {tr('h_attPct')}</div></div>
      <div className="dx-stat g3"><span className="ic"><IUserPlus size={26} /></span><div className="n">{t.leave}</div><div className="l">{tr('h_onLeave')}</div><div className="s">{active ? ((t.leave / active) * 100).toFixed(1) : '0'}% {tr('h_ofEmp')}</div></div>
      <div className="dx-stat g4"><span className="ic"><IAlert size={26} /></span><div className="n">{pending}</div><div className="l">{tr('h_pendingAppr')}</div><div className="s" onClick={() => go('approve')}>{tr('h_needsAction')} →</div></div>
    </div>

    <div className="dx-mid">
      <div className="dx-card"><div className="hd"><h3>{tr('h_attTrend')}</h3><span className="dx-pill">{tr('h_last6')}</span></div><Trend pts={pts} /></div>
      <div className="dx-card"><div className="hd"><h3>{tr('h_todaysAtt')}</h3></div>
        <div className="dx-donut"><Donut present={t.present} leave={t.leave} absent={t.absent} />
          <div className="dx-legend">
            <div><i style={{ background: '#287A3E' }} />{tr('present')}<b>{t.present}</b></div>
            <div><i style={{ background: '#f5c542' }} />{tr('h_onLeave')}<b>{t.leave}</b></div>
            <div><i style={{ background: '#f4a3a3' }} />{tr('h_absent')}<b>{t.absent}</b></div>
          </div></div></div>
    </div>

    <div className="dx-qa-h"><h3>{tr('h_quick')}</h3><a onClick={() => go('register')}>{tr('h_manageAll')} <IArrowR size={14} /></a></div>
    <div className="dx-qa">
      <button onClick={() => go('emps')}><IUserPlus />{tr('h_addEmp')}</button>
      <button onClick={() => go('register')}><ICalCheck />{tr('h_markAtt')}</button>
      <button onClick={() => go('approve')}><ICheckSq />{tr('h_approveReq')}</button>
      <button onClick={() => go('leave')}><ICalPlus />{tr('h_addLeave')}</button>
      <button onClick={() => go('holidays')}><IUmbrella />{tr('h_holiday')}</button>
      <button onClick={() => go('pay')}><IBars />{tr('h_genReport')}</button>
    </div>
  </>)
}
