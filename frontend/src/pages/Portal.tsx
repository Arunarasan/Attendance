import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import { fmtDateTime, fmtHours, fmtTime, get, post, today } from '../lib/api'
import { getBestPosition } from '../lib/geo'
import { hasLocalKey, publicKeyB64, signNonce, wifiBssid } from '../lib/deviceKey'
import FaceCapture from '../components/FaceCapture'
import FaceEnrol from './FaceEnrol'
import type { Me } from '../App'
import { IArrowR, IBack, IBell, ICal, ICalCheck, ICalPlus, ICheckCircle, IChevR, IClock, IDoc, IFace, IBriefcase, IFinger, IGear, IHeart, IHome, ILock, ISend, ISun, IUmbrella, IX, IPhone, IUser, Leaves } from '../components/icons'
import './portal.css'
import { LANGS, setLang, setTextSize, useT } from '../lib/i18n'

type Session = { id: number; clockIn: string; clockOut: string | null; breakStarted: string | null; breakMinutes: number; approvalStatus: string; flagged: boolean; flagReason: string | null }
type TodayData = { isOpen: boolean; onBreak: boolean; sessions: Session[]; days: { workedMinutes: number; overtimeMinutes: number }[] }

function ClockWidget({ onChange }: { onChange: () => void }) {
  const { t } = useT()
  const [data, setData] = useState<TodayData | null>(null)
  const [now, setNow] = useState(new Date())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  // Set while the camera step is open; resolves with the descriptor, or null when skipped.
  const [askFace, setAskFace] = useState<null | ((d: number[] | null) => void)>(null)
  const captureFace = () => new Promise<number[] | null>(res => setAskFace(() => (d: number[] | null) => { setAskFace(null); res(d) }))

  const load = useCallback(() => get<TodayData>('/api/me/today').then(setData).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  async function punch(action: 'in' | 'out' | 'break-start' | 'break-end') {
    setBusy(true); setErr(''); setNote('')
    try {
      let body: Record<string, unknown> = {}
      if (action === 'in' || action === 'out') {
        const face = await captureFace()
        setNote('Getting your location…')
        const pos = await getBestPosition()
        if (pos) body = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy }
        if (face) body = { ...body, descriptor: face }
        const bssid = wifiBssid()
        if (bssid) body = { ...body, bssid }
        if (await hasLocalKey()) {
          const { nonce } = await get<{ nonce: string }>('/api/nonce')
          body = { ...body, nonce, signature: await signNonce(nonce) }
        }
      }
      const s = await post<Session>(`/api/me/punch/${action}`, body)
      setNote(s.flagged ? `Recorded, but flagged for HR: ${s.flagReason}` : 'Recorded')
      await load()
      onChange()
    } catch (e: any) {
      setErr(e.message); setNote('')
    } finally {
      setBusy(false)
    }
  }

  const day = data?.days[0]
  if (askFace) return <FaceCapture title="Confirm it's you" onDone={d => askFace(d)} onCancel={() => askFace(null)} />
  const open = !!data?.isOpen
  const last = data?.sessions[data.sessions.length - 1]
  return (<>
    <section className="pm-card pm-today">
      <div className="pm-today-l">
        <h3>{t('todaysAttendance')}</h3>
        <div className="pm-time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        {last && <div className="pm-sub">{fmtTime(last.clockIn)}{last.clockOut ? ` → ${fmtTime(last.clockOut)}` : ''}</div>}
        <span className={`pm-status ${open ? 'in' : ''}`}><ICheckCircle size={16} />{!data ? '…' : open ? (data.onBreak ? t('onBreak') : t('checkedIn')) : data.sessions.length ? t('checkedOut') : t('notCheckedIn')}</span>
      </div>
      {data && <button className={`pm-punch ${open ? 'out' : ''}`} disabled={busy} onClick={() => punch(open ? 'out' : 'in')}>
        <IFinger size={38} /><span>{open ? t('checkOut') : data.sessions.length ? t('checkInAgain') : t('checkIn')}</span></button>}
    </section>
    {data?.isOpen && <button className="pm-break" disabled={busy} onClick={() => punch(data.onBreak ? 'break-end' : 'break-start')}>{data.onBreak ? t('endBreak') : t('startBreak')}</button>}
    {err && <div className="err">{err}</div>}
    {note && <div className="msg">{note}</div>}
    {day && <p className="pm-muted">Paid so far today: {fmtHours(day.workedMinutes)}{day.overtimeMinutes > 0 && ` (overtime ${fmtHours(day.overtimeMinutes)})`}</p>}
    {data && data.sessions.length > 0 && <section className="pm-card pm-list">
      {data.sessions.map(s => (
        <div key={s.id} className="pm-li"><span className="pm-ok"><ICheckCircle size={20} /></span>
          <span className="pm-li-t">{fmtTime(s.clockIn)} → {s.clockOut ? fmtTime(s.clockOut) : 'open'}{s.breakMinutes > 0 && ` · break ${s.breakMinutes}m`}</span>
          <span className={`pill ${s.approvalStatus === 'APPROVED' ? 'ok' : 'warn'}`} title={s.flagReason ?? ''}>{s.approvalStatus.toLowerCase()}</span></div>
      ))}
    </section>}
  </>)
}

const monthOf = (offset: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

function Donut({ present, leave, total }: { present: number; leave: number; total: number }) {
  const r = 52, c = 2 * Math.PI * r
  const seg: [number, string][] = [[present, '#3f9a1b'], [leave, '#f5c542']]
  let off = 0
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
      <circle cx="75" cy="75" r={r} fill="none" stroke="#eef2e6" strokeWidth="16" />
      {total > 0 && seg.map(([n, col], i) => { const len = (n / total) * c; const el = n > 0 ? <circle key={i} cx="75" cy="75" r={r} fill="none" stroke={col} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 75 75)" /> : null; off += len; return el })}
      <text x="75" y="76" textAnchor="middle" style={{ font: '700 22px Poppins, sans-serif', fill: '#1f2a1c' }}>{total ? ((present / total) * 100).toFixed(1) : '0'}%</text>
      <text x="75" y="95" textAnchor="middle" style={{ font: '12px Poppins, sans-serif', fill: '#5d6b55' }}>Attendance</text>
    </svg>
  )
}

function useMonth(month: string, version: number) {
  const [days, setDays] = useState<any[]>([])
  const [leave, setLeave] = useState(0)
  useEffect(() => {
    get(`/api/me/timesheet?month=${month}`).then(r => setDays(r.days)).catch(() => setDays([]))
    get('/api/me/leave').then((l: any[]) => setLeave(l.filter(x => x.status === 'APPROVED' && String(x.startDate).startsWith(month)).reduce((a, x) => a + Number(x.days), 0))).catch(() => setLeave(0))
  }, [month, version])
  return { days, leave }
}

const levelName: Record<string, string> = { GOLD: 'Gold', SILVER: 'Silver', BRONZE: 'Bronze', IMPROVE: 'Needs improvement', NO_DATA: '' }

function ScoreCard({ version }: { version: number }) {
  const { t } = useT()
  const [s, setS] = useState<any>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { get('/api/me/score').then(setS).catch(() => setS(null)) }, [version])
  if (!s) return null
  const has = s.score != null
  const lv = has ? (s.score >= 90 ? 'gold' : s.score >= 75 ? 'silver' : s.score >= 60 ? 'bronze' : 'imp') : 'imp'
  const rows: [string, number, string][] = [['Attendance', s.attendancePct, `${s.fullDays} full + ${s.halfDays} half of ${s.requiredDays} days`], ['On time', s.punctualityPct, `${s.lateDays} late arrivals`], ['Full hours', s.hoursPct, ''], ['Discipline', s.disciplinePct, `${s.flaggedPunches} flagged punches, ${s.corrections} corrections`]]
  return (
    <section className="pm-card sc-card" onClick={() => has && setOpen(o => !o)}>
      <span className={`sc-ring ${lv}`} style={{ ['--p' as any]: `${s.score ?? 0}%` }}><b>{has ? s.score : '—'}</b></span>
      <div className="sc-m"><h3>{t('honourScore')}</h3><small>{has ? `${levelName[s.level] ?? ''} · out of 100` : t('noScoreYet')}</small></div>
      {has && <span className={`sc-lv ${lv}`}>{levelName[s.level]}</span>}
      {open && <div className="sc-break">{rows.map(([l, v, d]) => <div key={l}><span>{l}<small>{d}</small></span><div className="sc-meter"><i style={{ width: `${v}%` }} /></div><b>{v}%</b></div>)}</div>}
    </section>
  )
}

function MonthStats({ version, onAll }: { version: number; onAll: () => void }) {
  const { t } = useT()
  const { days, leave } = useMonth(monthOf(0), version)
  const ot = days.reduce((a, d) => a + d.overtimeMinutes, 0)
  return (<>
    <div className="pm-h"><h3>{t('thisMonth')}</h3><a onClick={onAll}>{t('viewAll')} <IArrowR size={14} /></a></div>
    <div className="pm-stats">
      <div className="g"><b>{days.length}</b><span>{t('present')}</span></div>
      <div className="y"><b>{Number.isInteger(leave) ? leave : leave.toFixed(1)}</b><span>{t('leave')}</span></div>
      <div className="r"><b>{Math.round(ot / 60)}h</b><span>{t('overtime')}</span></div>
    </div>
  </>)
}

function Timesheet({ version }: { version: number }) {
  const { t } = useT()
  const [range, setRange] = useState<'this' | 'last' | 'custom'>('this')
  const [custom, setCustom] = useState(monthOf(0))
  const month = range === 'this' ? monthOf(0) : range === 'last' ? monthOf(-1) : custom
  const { days, leave } = useMonth(month, version)
  const total = days.reduce((a, d) => a + d.workedMinutes, 0)
  const ot = days.reduce((a, d) => a + d.overtimeMinutes, 0)
  const rows = [...days].sort((a, b) => String(b.workDate).localeCompare(String(a.workDate)))
  return (<>
    <div className="pm-seg">
      {([['this', t('thisMonth')], ['last', t('lastMonth')], ['custom', t('custom')]] as const).map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}
    </div>
    {range === 'custom' && <input type="month" className="pm-month" value={custom} onChange={e => setCustom(e.target.value)} />}
    <section className="pm-card pm-donut">
      <Donut present={days.length} leave={leave} total={days.length + leave} />
      <div className="pm-legend">
        <div><i style={{ background: '#3f9a1b' }} />{t('present')}<b>{days.length}</b></div>
        <div><i style={{ background: '#f5c542' }} />{t('leave')}<b>{Number.isInteger(leave) ? leave : leave.toFixed(1)}</b></div>
        <div><i style={{ background: '#f4a3a3' }} />{t('overtime')}<b>{fmtHours(ot)}</b></div>
      </div>
    </section>
    <div className="pm-h"><h3>{t('attendanceLog')}</h3><span className="pm-muted">Paid {fmtHours(total)}</span></div>
    <section className="pm-card pm-list">
      {rows.length === 0 && <p className="pm-muted" style={{ margin: 0 }}>No attendance this month.</p>}
      {rows.map(d => (
        <div key={d.workDate} className="pm-li"><span className="pm-ok"><ICheckCircle size={20} /></span>
          <span className="pm-li-t">{new Date(d.workDate + 'T00:00').toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' })}</span>
          <span className="pm-li-r">{fmtTime(d.checkIn)} – {d.checkOut ? fmtTime(d.checkOut) : '--'}</span></div>
      ))}
    </section>
  </>)
}

function Corrections() {
  const [list, setList] = useState<any[]>([])
  const [date, setDate] = useState(today())
  const [inT, setIn] = useState('09:00')
  const [outT, setOut] = useState('17:00')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const load = () => get('/api/me/corrections').then(setList)
  useEffect(() => { load() }, [])
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk('')
    try {
      await post('/api/me/corrections', { date, requestedIn: `${date}T${inT}:00`, requestedOut: `${date}T${outT}:00`, reason })
      setOk('Sent to HR'); setReason(''); load()
    } catch (e: any) { setErr(e.message) }
  }
  return (
    <div className="card">
      <h2>Request a time correction</h2>
      <form onSubmit={submit}>
        <div className="grid">
          <div><label>Date</label><input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} required /></div>
          <div><label>Clock in</label><input type="time" value={inT} onChange={e => setIn(e.target.value)} required /></div>
          <div><label>Clock out</label><input type="time" value={outT} onChange={e => setOut(e.target.value)} required /></div>
        </div>
        <label>Reason</label><input value={reason} onChange={e => setReason(e.target.value)} required />
        {err && <div className="err">{err}</div>}{ok && <div className="msg">{ok}</div>}
        <p><button className="btn">Send</button></p>
      </form>
      <table><thead><tr><th>Date</th><th>Requested</th><th>Status</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.id}><td>{c.workDate}</td><td>{fmtTime(c.requestedIn)} – {fmtTime(c.requestedOut)}</td><td><span className="pill">{c.status.toLowerCase()}</span></td></tr>)}</tbody></table>
    </div>
  )
}

const typeIcon = (name: string, size = 24) => {
  const n = (name ?? '').toLowerCase()
  return n.includes('sick') || n.includes('medic') ? <IHeart size={size} /> : n.includes('casual') ? <IUmbrella size={size} />
    : n.includes('earn') || n.includes('annual') || n.includes('privilege') ? <ISun size={size} /> : <IBriefcase size={size} />
}
const REASONS = ['Family function', 'Medical', 'Personal work', 'Travel']
const dayMs = 86400000
const dateOf = (d: string) => new Date(d + 'T00:00')
const nice = (d: string) => dateOf(d).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
const dow = (d: string) => dateOf(d).toLocaleDateString([], { weekday: 'long' })

function DateTile({ label, value, min, onChange }: { label: string; value: string; min?: string; onChange: (v: string) => void }) {
  return (
    <label className="lv-date">
      <span className="lv-date-ic"><ICal size={22} /></span>
      <span className="lv-date-l">{label}</span>
      <b>{nice(value)}</b><small>{dow(value)}</small>
      <input type="date" value={value} min={min} onChange={e => onChange(e.target.value)} required />
    </label>
  )
}

function Leave() {
  const [bal, setBal] = useState<any[]>([])
  const [reqs, setReqs] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [f, setF] = useState({ leaveTypeId: '', startDate: today(), endDate: today(), halfDay: false, reason: '' })
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => {
    get('/api/me/leave/balances').then(b => { setBal(b); setF(x => x.leaveTypeId || !b.length ? x : { ...x, leaveTypeId: String(b[0].leaveTypeId) }) })
    get('/api/me/leave').then(setReqs)
    get('/api/me/holidays').then(setHolidays)
  }
  useEffect(() => { load() }, [])
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk(''); setBusy(true)
    try {
      await post('/api/me/leave', { ...f, leaveTypeId: Number(f.leaveTypeId), halfDay: f.halfDay && f.startDate === f.endDate })
      setOk('Request sent to HR'); setF({ ...f, reason: '', halfDay: false }); load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const withdraw = async (id: number) => { try { await post(`/api/me/leave/${id}/cancel`); load() } catch (e: any) { setErr(e.message) } }
  const num = (v: any) => Number(v).toString()
  const same = f.startDate === f.endDate
  const span = Math.max(1, Math.round((dateOf(f.endDate).getTime() - dateOf(f.startDate).getTime()) / dayMs) + 1)
  const days = same && f.halfDay ? 0.5 : span
  const upcoming = holidays.filter(h => h.holidayDate >= today()).slice(0, 4)
  return (<>
    <div className="pm-h"><h3>Leave type</h3></div>
    <div className="lv-types">
      {bal.map(b => {
        const sel = String(b.leaveTypeId) === f.leaveTypeId
        const pct = b.remaining != null && Number(b.quota) > 0 ? Math.max(0, Math.min(100, (Number(b.remaining) / Number(b.quota)) * 100)) : 100
        return (
          <button key={b.leaveTypeId} type="button" className={`lv-type${sel ? ' on' : ''}`} onClick={() => setF({ ...f, leaveTypeId: String(b.leaveTypeId) })}>
            <span className="lv-ring" style={{ background: `conic-gradient(#3f9a1b ${pct}%, #e8eddc 0)` }}><span>{typeIcon(b.name, 22)}</span></span>
            <b>{b.name}</b>
            <small>{b.remaining != null ? `${num(b.remaining)} of ${num(b.quota)} left` : 'No limit'}</small>
            {Number(b.pending) > 0 && <em>{num(b.pending)} waiting</em>}
          </button>)
      })}
    </div>

    <form onSubmit={submit}>
      <div className="pm-h"><h3>Dates</h3></div>
      <div className="lv-dates">
        <DateTile label="From" value={f.startDate} onChange={v => setF({ ...f, startDate: v, endDate: v > f.endDate ? v : f.endDate })} />
        <span className="lv-arrow"><IArrowR size={20} /></span>
        <DateTile label="To" value={f.endDate} min={f.startDate} onChange={v => setF({ ...f, endDate: v })} />
      </div>
      <div className="lv-sum">
        <span className="lv-days"><b>{days}</b> {days === 1 ? 'day' : 'days'}</span>
        {same && <button type="button" className={`lv-half${f.halfDay ? ' on' : ''}`} onClick={() => setF({ ...f, halfDay: !f.halfDay })}><i />Half day</button>}
      </div>
      <p className="pm-muted" style={{ margin: '6px 2px 0' }}>Weekly offs and holidays in the range are not counted.</p>

      <div className="pm-h"><h3>Reason</h3></div>
      <div className="lv-chips">{REASONS.map(r => <button key={r} type="button" className={f.reason === r ? 'on' : ''} onClick={() => setF({ ...f, reason: r })}>{r}</button>)}</div>
      <textarea className="lv-reason" rows={3} placeholder="Write a short reason (optional)" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} />

      {err && <div className="err">{err}</div>}{ok && <div className="msg">{ok}</div>}
      <button className="lv-submit" disabled={busy || !f.leaveTypeId}><ISend size={20} />{busy ? 'Sending…' : 'Submit Request'}</button>
    </form>

    <div className="pm-h"><h3>My requests</h3></div>
    {reqs.length === 0 && <section className="pm-card"><p className="pm-muted" style={{ margin: 0 }}>No leave requests yet.</p></section>}
    {reqs.map(r => {
      const st = r.status === 'APPROVED' ? 'ok' : r.status === 'PENDING' ? 'wait' : 'no'
      return (
        <section key={r.id} className="pm-card lv-req">
          <span className={`lv-st ${st}`}>{st === 'ok' ? <ICheckCircle size={22} /> : st === 'wait' ? <IClock size={22} /> : <IX size={22} />}</span>
          <div className="lv-req-m">
            <b>{r.leaveName}</b>
            <small>{nice(r.startDate)}{r.endDate !== r.startDate && ` → ${nice(r.endDate)}`}{r.halfDay && ' (half day)'}</small>
            <small>{num(r.days)} {Number(r.days) === 1 ? 'day' : 'days'} · {r.status.toLowerCase()}</small>
          </div>
          {r.status === 'PENDING' && <button className="lv-wd" onClick={() => withdraw(r.id)}>Withdraw</button>}
        </section>)
    })}

    {upcoming.length > 0 && <>
      <div className="pm-h"><h3>Upcoming holidays</h3></div>
      <section className="pm-card pm-list">
        {upcoming.map(h => (
          <div key={h.id} className="pm-li"><span className="lv-hd"><b>{dateOf(h.holidayDate).getDate()}</b>{dateOf(h.holidayDate).toLocaleDateString([], { month: 'short' })}</span>
            <span className="pm-li-t">{h.name}</span><span className="pm-li-r">{h.paid ? 'Paid' : 'Unpaid'}</span></div>))}
      </section>
    </>}
  </>)
}

function Payslips() {
  const { t } = useT()
  const [list, setList] = useState<any[]>([])
  useEffect(() => { get('/api/me/payslips').then(setList) }, [])
  const m = (v: any) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (<>
    {list.length === 0 && <section className="pm-card"><p className="pm-muted" style={{ margin: 0 }}>No payslips yet.</p></section>}
    {list.map(p => (
      <section key={p.id} className="pm-card ps-card">
        <div className="ps-top"><div><small>{new Date(p.period + '-01T00:00').toLocaleDateString([], { month: 'long', year: 'numeric' })}</small><h3>{m(p.net)}</h3><small>{t('netPay')}{p.payMode && ` · ${String(p.payMode).toLowerCase()}`}</small></div>
          {p.score != null && <span className="sc-pill">{t('honourScore')} {p.score}</span>}</div>
        <div className="ps-rows">
          <div><span>Hours</span><b>{p.regularHours} h</b></div>
          {Number(p.overtimeHours) > 0 && <div><span>Overtime</span><b>{p.overtimeHours} h</b></div>}
          {Number(p.allowances) > 0 && <div><span>{t('allowances')}</span><b>+{m(p.allowances)}</b></div>}
          {Number(p.bonus) > 0 && <div><span>{t('bonus')}</span><b>+{m(p.bonus)}</b></div>}
          <div><span>Gross</span><b>{m(p.gross)}</b></div>
          {Number(p.lopDays) > 0 && <div className="bad"><span>{t('lossOfPay')} ({Number(p.lopDays)} d)</span><b>−{m(p.lopAmount)}</b></div>}
          {Number(p.deductions) > 0 && <div className="bad"><span>Deductions</span><b>−{m(p.deductions)}</b></div>}
          {Number(p.adjustments) !== 0 && <div><span>Adjustments</span><b>{m(p.adjustments)}</b></div>}
          {(Number(p.paidLeaveDays) + Number(p.holidayDays) > 0) && <div><span>Paid leave + holidays</span><b>{Number(p.paidLeaveDays) + Number(p.holidayDays)} d</b></div>}
          {Number(p.unpaidLeaveDays) > 0 && <div className="bad"><span>Unpaid leave</span><b>{Number(p.unpaidLeaveDays)} d</b></div>}
        </div>
        {p.deductionDetail && <small className="pm-muted">{p.deductionDetail}</small>}
      </section>))}
  </>)
}

function Phone() {
  const [devices, setDevices] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const load = () => get('/api/me/devices').then(setDevices)
  useEffect(() => { load() }, [])
  async function bind() {
    setErr(''); setMsg('')
    try {
      const d = await post('/api/me/devices/bind', { publicKey: await publicKeyB64(), label: navigator.userAgent.slice(0, 100), bssid: wifiBssid() })
      setMsg(d.status === 'APPROVED' ? 'This phone is registered.' : 'Sent to HR for approval (you were not on the office network, or you already have a phone).'); load()
    } catch (e: any) { setErr(e.message) }
  }
  return (
    <div className="card"><h2>My phone</h2>
      <p className="muted">Registering a phone lets the system confirm punches really come from you. Register it from the office WiFi so it is approved straight away; from anywhere else it waits for HR. Only one phone is allowed.</p>
      <button className="btn" onClick={bind}>Register this phone</button>
      {msg && <div className="msg">{msg}</div>}{err && <div className="err">{err}</div>}
      <table><thead><tr><th>Phone</th><th>Status</th><th>Added</th></tr></thead>
        <tbody>{devices.map(d => <tr key={d.id}><td>{d.label}</td><td><span className="pill">{d.status.toLowerCase()}</span></td><td>{fmtDateTime(d.createdAt)}</td></tr>)}</tbody></table>
    </div>
  )
}

function MyFace({ me }: { me: Me }) {
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const load = () => get<{ enrolled: boolean }>('/api/me/face').then(r => setEnrolled(r.enrolled))
  useEffect(() => { load() }, [])
  if (open) return <FaceEnrol employee={{ id: me.id, name: me.name }} endpoint="/api/me/face" onClose={() => { setOpen(false); load() }} />
  return (
    <div className="card"><h2>My face</h2>
      {enrolled === null ? null : enrolled
        ? <p className="muted">Your face is enrolled, so you can clock in and out with just your face. To change it, ask HR to reset it.</p>
        : <><p className="muted">Enrol your face once and you can clock in and out with just your face, with no sign-in. Do it yourself now, in good light, alone in the frame.</p>
          <button className="btn" onClick={() => setOpen(true)}>Enrol my face</button></>}
    </div>
  )
}

type Sub = null | 'fix' | 'pay' | 'face' | 'phone' | 'settings'
const SUBS: [Exclude<Sub, null>, string, ReactNode][] = [
  ['fix', 'timeCorrections', <IClock key="c" size={22} />], ['pay', 'payslips', <IDoc key="d" size={22} />],
  ['face', 'myFace', <IFace key="f" size={22} />], ['phone', 'myPhone', <IPhone key="p" size={22} />],
  ['settings', 'settings', <IGear key="g" size={22} />],
]
const PROFILE_ROWS: Exclude<Sub, null>[] = ['fix', 'pay', 'face', 'phone', 'settings']

const PERMS = [['camera', 'camera'], ['geolocation', 'location']] as const
type PermState = 'granted' | 'denied' | 'prompt' | 'unknown'

function Permissions() {
  const { t } = useT()
  const [st, setSt] = useState<Record<string, PermState>>({})
  const refresh = useCallback(async () => {
    const out: Record<string, PermState> = {}
    for (const [name] of PERMS) {
      try { out[name] = (await navigator.permissions.query({ name: name as PermissionName })).state as PermState } catch { out[name] = 'unknown' }
    }
    setSt(out)
  }, [])
  useEffect(() => { refresh() }, [refresh])
  const ask = async (name: string) => {
    try {
      if (name === 'camera') (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach(x => x.stop())
      else await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }))
    } catch { /* denied or unavailable: the status below shows it */ }
    refresh()
  }
  const label = (s?: PermState) => s === 'granted' ? t('granted') : s === 'denied' ? t('denied') : s === 'prompt' ? t('notAsked') : t('unknown')
  return (<>
    <div className="pm-h"><h3>{t('permissions')}</h3></div>
    <section className="pm-card">
      {PERMS.map(([name, key]) => (
        <div key={name} className="pm-li"><span className="pm-li-t">{t(key)}</span>
          <span className={`pill ${st[name] === 'granted' ? 'ok' : st[name] === 'denied' ? 'bad' : 'warn'}`}>{label(st[name])}</span>
          {st[name] !== 'granted' && <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => ask(name)}>{t('allow')}</button>}
        </div>))}
      <p className="pm-muted" style={{ margin: '8px 0 0' }}>{t('permHelp')}</p>
    </section>
  </>)
}

function ChangePassword() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ cur: '', next: '', again: '' })
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk('')
    if (f.next !== f.again) { setErr(t('passwordsDontMatch')); return }
    try { await post('/api/me/password', { currentPassword: f.cur, newPassword: f.next }); setOk(t('passwordChanged')); setF({ cur: '', next: '', again: '' }); setOpen(false) } catch (e: any) { setErr(e.message) }
  }
  return (<>
    <div className="pm-h"><h3>{t('account')}</h3></div>
    <section className="pm-card pm-menu">
      <button onClick={() => { setOpen(o => !o); setOk('') }}><ILock size={22} /><span>{t('changePassword')}</span><IChevR size={18} /></button>
    </section>
    {ok && <div className="msg">{ok}</div>}
    {open && <form className="pm-card" onSubmit={submit}>
      <label>{t('currentPassword')}</label><input type="password" autoComplete="current-password" value={f.cur} onChange={e => setF({ ...f, cur: e.target.value })} required />
      <label>{t('newPassword')}</label><input type="password" autoComplete="new-password" minLength={8} value={f.next} onChange={e => setF({ ...f, next: e.target.value })} required />
      <label>{t('confirmPassword')}</label><input type="password" autoComplete="new-password" minLength={8} value={f.again} onChange={e => setF({ ...f, again: e.target.value })} required />
      {err && <div className="err">{err}</div>}
      <p style={{ marginBottom: 0 }}><button className="btn">{t('save')}</button></p>
    </form>}
  </>)
}

/** App settings only: things about this app on this device. */
function AppSettings() {
  const { t, lang, size } = useT()
  const [msg, setMsg] = useState('')
  const saved = (() => { try { return localStorage.getItem('attendance.lastId') } catch { return null } })()
  const forget = () => { try { localStorage.removeItem('attendance.lastId') } catch { /* storage unavailable */ } setMsg(t('idCleared')) }
  return (<>
    <div className="pm-h"><h3>{t('language')}</h3></div>
    <section className="pm-card">
      <p className="pm-muted" style={{ margin: '0 0 10px' }}>{t('chooseLanguage')}</p>
      <div className="pm-seg" style={{ margin: 0 }}>
        {LANGS.map(([k, l]) => <button key={k} className={lang === k ? 'on' : ''} onClick={() => setLang(k)}>{l}</button>)}
      </div>
    </section>
    <div className="pm-h"><h3>{t('textSize')}</h3></div>
    <section className="pm-card">
      <div className="pm-seg" style={{ margin: 0 }}>
        {(['small', 'normal', 'large'] as const).map(k => <button key={k} className={size === k ? 'on' : ''} onClick={() => setTextSize(k)}>{t(k)}</button>)}
      </div>
    </section>
    <Permissions />
    <ChangePassword />
    <div className="pm-h"><h3>{t('appSettings')}</h3></div>
    <section className="pm-card pm-menu">
      <button onClick={forget} disabled={!saved}><IUser size={22} /><span>{t('forgetId')}</span></button>
      <button onClick={() => window.location.reload()}><IArrowR size={22} /><span>{t('reloadApp')}</span></button>
    </section>
    {msg && <div className="msg">{msg}</div>}
    <div className="pm-h"><h3>{t('aboutApp')}</h3></div>
    <section className="pm-card">
      <div className="pm-li"><span className="pm-li-t">{t('appName')}</span><span className="pm-li-r">AttendancePro</span></div>
      <div className="pm-li"><span className="pm-li-t">{t('company')}</span><span className="pm-li-r">Arudra Commercial Services</span></div>
      <div className="pm-li"><span className="pm-li-t">{t('developedBy')}</span><span className="pm-li-r">Arun</span></div>
      <div className="pm-li"><span className="pm-li-t">{t('contact')}</span><span className="pm-li-r"><a href="tel:9629129864">9629129864</a></span></div>
      <div className="pm-li"><span className="pm-li-t">{t('version')}</span><span className="pm-li-r">0.1.0</span></div>
    </section>
  </>)
}

function Profile({ me, onLogout, open }: { me: Me; onLogout: () => void; open: (s: Sub) => void }) {
  const { t } = useT()
  const initials = me.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (<>
    <section className="pm-prof"><span className="pm-av big">{initials}</span><h2>{me.name}</h2><p>{me.employeeCode}</p></section>
    <section className="pm-card pm-menu">
      {SUBS.filter(x => PROFILE_ROWS.includes(x[0])).map(([k, l, ic]) => <button key={k} onClick={() => open(k)}>{ic}<span>{t(l)}</span><IChevR size={18} /></button>)}
    </section>
    <button className="pm-signout" onClick={onLogout}>{t('signOut')}</button>
  </>)
}

export default function Portal({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { t, size } = useT()
  const [tab, setTab] = useState<'home' | 'att' | 'leave' | 'me'>('home')
  const [sub, setSub] = useState<Sub>(null)
  const [version, setVersion] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => { get<any[]>('/api/me/leave').then(l => setPendingCount(l.filter(x => x.status === 'PENDING').length)).catch(() => {}) }, [tab])
  const hour = new Date().getHours()
  const hello = hour < 12 ? t('morning') : hour < 17 ? t('afternoon') : t('evening')
  const initials = me.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const pick = (t: typeof tab) => { setTab(t); setSub(null) }
  const title = sub ? t(SUBS.find(x => x[0] === sub)![1]) : tab === 'att' ? t('myAttendance') : tab === 'leave' ? t('leaveRequest') : tab === 'me' ? t('myProfile') : ''
  const NAV: [typeof tab, string, ReactNode][] = [['home', t('home'), <IHome key="h" />], ['att', t('attendance'), <ICalCheck key="a" />], ['leave', t('leave'), <ICal key="l" />], ['me', t('profile'), <IUser key="u" />]]
  return (
    <div className={`pm pm-${size}`}>
      <Leaves className="pm-leaves" />
      <header className="pm-head">
        {title ? <>
          <button className="pm-back" onClick={() => sub ? setSub(null) : pick('home')} aria-label="Back"><IBack /></button><h1>{title}</h1><span style={{ width: 40 }} />
        </> : <>
          <span className="pm-av">{initials}</span>
          <div className="pm-hello"><b>{hello}, {me.name.split(' ')[0]} <span aria-hidden="true">👋</span></b><small>{t('employee')} · {me.employeeCode}</small></div>
          <button className="pm-bell" onClick={() => pick('leave')} aria-label="Leave requests"><IBell />{pendingCount > 0 && <i />}</button>
        </>}
      </header>
      <main className="pm-main">
        {tab === 'home' && !sub && <>
          <ClockWidget onChange={() => setVersion(v => v + 1)} />
          <div className="pm-tiles">
            <button onClick={() => pick('att')}><ICalCheck size={30} />{t('myAttendance')}</button>
            <button onClick={() => pick('leave')}><ICalPlus size={30} />{t('leaveRequest')}</button>
            <button onClick={() => { setTab('me'); setSub('fix') }}><IClock size={30} />{t('timeCorrection')}</button>
          </div>
          <ScoreCard version={version} />
          <MonthStats version={version} onAll={() => pick('att')} />
        </>}
        {tab === 'att' && !sub && <Timesheet version={version} />}
        {tab === 'leave' && !sub && <Leave />}
        {tab === 'me' && !sub && <Profile me={me} onLogout={onLogout} open={setSub} />}
        {sub === 'settings' && <AppSettings />}
        {sub === 'fix' && <Corrections />}
        {sub === 'pay' && <Payslips />}
        {sub === 'face' && <MyFace me={me} />}
        {sub === 'phone' && <Phone />}
      </main>
      <nav className="pm-nav">
        {NAV.map(([k, l, ic]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>{ic}<span>{l}</span></button>)}
      </nav>
    </div>
  )
}
