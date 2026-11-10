import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtDateTime, fmtHours, fmtTime, get, post, today } from '../lib/api'
import { getBestPosition } from '../lib/geo'
import { hasLocalKey, publicKeyB64, signNonce, wifiBssid } from '../lib/deviceKey'
import FaceCapture from '../components/FaceCapture'
import FaceEnrol from './FaceEnrol'
import type { Me } from '../App'
import { IArrowR, IBack, IBell, ICal, ICalCheck, ICalPlus, ICheckCircle, IChevR, IClock, IDoc, IFace, IFinger, IHome, IPhone, IUser, Leaves } from '../components/icons'
import './portal.css'

type Session = { id: number; clockIn: string; clockOut: string | null; breakStarted: string | null; breakMinutes: number; approvalStatus: string; flagged: boolean; flagReason: string | null }
type TodayData = { isOpen: boolean; onBreak: boolean; sessions: Session[]; days: { workedMinutes: number; overtimeMinutes: number }[] }

function ClockWidget({ onChange }: { onChange: () => void }) {
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
        <h3>Today's Attendance</h3>
        <div className="pm-time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        {last && <div className="pm-sub">{fmtTime(last.clockIn)}{last.clockOut ? ` → ${fmtTime(last.clockOut)}` : ''}</div>}
        <span className={`pm-status ${open ? 'in' : ''}`}><ICheckCircle size={16} />{!data ? '…' : open ? (data.onBreak ? 'On break' : 'Checked In') : data.sessions.length ? 'Checked Out' : 'Not checked in'}</span>
      </div>
      {data && <button className={`pm-punch ${open ? 'out' : ''}`} disabled={busy} onClick={() => punch(open ? 'out' : 'in')}>
        <IFinger size={38} /><span>{open ? 'Check Out' : data.sessions.length ? 'Check In again' : 'Check In'}</span></button>}
    </section>
    {data?.isOpen && <button className="pm-break" disabled={busy} onClick={() => punch(data.onBreak ? 'break-end' : 'break-start')}>{data.onBreak ? 'End break' : 'Start break'}</button>}
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

function MonthStats({ version, onAll }: { version: number; onAll: () => void }) {
  const { days, leave } = useMonth(monthOf(0), version)
  const ot = days.reduce((a, d) => a + d.overtimeMinutes, 0)
  return (<>
    <div className="pm-h"><h3>This Month</h3><a onClick={onAll}>View All <IArrowR size={14} /></a></div>
    <div className="pm-stats">
      <div className="g"><b>{days.length}</b><span>Present</span></div>
      <div className="y"><b>{Number.isInteger(leave) ? leave : leave.toFixed(1)}</b><span>Leave</span></div>
      <div className="r"><b>{Math.round(ot / 60)}h</b><span>Overtime</span></div>
    </div>
  </>)
}

function Timesheet({ version }: { version: number }) {
  const [range, setRange] = useState<'this' | 'last' | 'custom'>('this')
  const [custom, setCustom] = useState(monthOf(0))
  const month = range === 'this' ? monthOf(0) : range === 'last' ? monthOf(-1) : custom
  const { days, leave } = useMonth(month, version)
  const total = days.reduce((a, d) => a + d.workedMinutes, 0)
  const ot = days.reduce((a, d) => a + d.overtimeMinutes, 0)
  const rows = [...days].sort((a, b) => String(b.workDate).localeCompare(String(a.workDate)))
  return (<>
    <div className="pm-seg">
      {([['this', 'This Month'], ['last', 'Last Month'], ['custom', 'Custom']] as const).map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}
    </div>
    {range === 'custom' && <input type="month" className="pm-month" value={custom} onChange={e => setCustom(e.target.value)} />}
    <section className="pm-card pm-donut">
      <Donut present={days.length} leave={leave} total={days.length + leave} />
      <div className="pm-legend">
        <div><i style={{ background: '#3f9a1b' }} />Present<b>{days.length}</b></div>
        <div><i style={{ background: '#f5c542' }} />Leave<b>{Number.isInteger(leave) ? leave : leave.toFixed(1)}</b></div>
        <div><i style={{ background: '#f4a3a3' }} />Overtime<b>{fmtHours(ot)}</b></div>
      </div>
    </section>
    <div className="pm-h"><h3>Attendance Log</h3><span className="pm-muted">Paid {fmtHours(total)}</span></div>
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

function Leave() {
  const [bal, setBal] = useState<any[]>([])
  const [reqs, setReqs] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [f, setF] = useState({ leaveTypeId: '', startDate: today(), endDate: today(), halfDay: false, reason: '' })
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const load = () => {
    get('/api/me/leave/balances').then(b => { setBal(b); setF(x => x.leaveTypeId || !b.length ? x : { ...x, leaveTypeId: String(b[0].leaveTypeId) }) })
    get('/api/me/leave').then(setReqs)
    get('/api/me/holidays').then(setHolidays)
  }
  useEffect(() => { load() }, [])
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk('')
    try {
      await post('/api/me/leave', { ...f, leaveTypeId: Number(f.leaveTypeId), halfDay: f.halfDay && f.startDate === f.endDate })
      setOk('Sent to HR'); setF({ ...f, reason: '', halfDay: false }); load()
    } catch (e: any) { setErr(e.message) }
  }
  const withdraw = async (id: number) => { try { await post(`/api/me/leave/${id}/cancel`); load() } catch (e: any) { setErr(e.message) } }
  const num = (v: any) => Number(v).toString()
  return (<>
    <div className="card"><h2>My leave balance</h2>
      <div className="grid">{bal.map(b => (
        <div key={b.leaveTypeId}><b>{b.name}</b>
          <div className="muted">{b.paid ? 'Paid' : 'Unpaid'}{b.remaining != null ? ` · ${num(b.remaining)} of ${num(b.quota)} days left` : ' · no limit'}</div>
          <div className="muted">Used {num(b.used)}{Number(b.pending) > 0 ? ` · waiting ${num(b.pending)}` : ''}</div></div>))}
      </div></div>
    <div className="card"><h2>Ask for leave</h2>
      <form onSubmit={submit}>
        <div className="grid">
          <div><label>Type</label><select value={f.leaveTypeId} onChange={e => setF({ ...f, leaveTypeId: e.target.value })} required>{bal.map(b => <option key={b.leaveTypeId} value={b.leaveTypeId}>{b.name}</option>)}</select></div>
          <div><label>From</label><input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} required /></div>
          <div><label>To</label><input type="date" value={f.endDate} min={f.startDate} onChange={e => setF({ ...f, endDate: e.target.value })} required /></div>
        </div>
        {f.startDate === f.endDate && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.halfDay} onChange={e => setF({ ...f, halfDay: e.target.checked })} /> Half day</label>}
        <label>Reason</label><input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} />
        <p className="muted">Weekly offs and holidays inside the range are not counted.</p>
        {err && <div className="err">{err}</div>}{ok && <div className="msg">{ok}</div>}
        <p><button className="btn">Submit Request</button></p>
      </form>
      <table><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th></th></tr></thead>
        <tbody>{reqs.map(r => <tr key={r.id}><td>{r.leaveName}</td><td>{r.startDate}{r.endDate !== r.startDate && ` → ${r.endDate}`}{r.halfDay && ' (half)'}</td><td>{num(r.days)}</td>
          <td><span className={`pill ${r.status === 'APPROVED' ? 'ok' : r.status === 'PENDING' ? 'warn' : ''}`}>{r.status.toLowerCase()}</span></td>
          <td>{r.status === 'PENDING' && <button className="btn ghost" onClick={() => withdraw(r.id)}>Withdraw</button>}</td></tr>)}</tbody></table></div>
    <div className="card"><h2>Holidays this year</h2>
      {holidays.length === 0 && <p className="muted">None added yet.</p>}
      <table><tbody>{holidays.map(h => <tr key={h.id}><td>{h.holidayDate}</td><td>{h.name}</td><td>{h.paid ? 'Paid' : 'Unpaid'}</td></tr>)}</tbody></table></div>
  </>)
}

function Payslips() {
  const [list, setList] = useState<any[]>([])
  useEffect(() => { get('/api/me/payslips').then(setList) }, [])
  return (
    <div className="card"><h2>Payslips</h2>
      {list.length === 0 && <p className="muted">No payslips yet.</p>}
      <div className="scroll"><table><thead><tr><th>Period</th><th>Hours</th><th>Overtime</th><th>Leave + holiday</th><th>Gross</th><th>Deductions</th><th>Adjust</th><th>Net</th></tr></thead>
        <tbody>{list.map(p => <tr key={p.id}><td>{p.period}</td><td>{p.regularHours} h</td><td>{p.overtimeHours} h</td><td>{Number(p.paidLeaveDays) + Number(p.holidayDays)} d{Number(p.unpaidLeaveDays) > 0 && <div className="muted">{Number(p.unpaidLeaveDays)} d unpaid</div>}</td><td>{p.gross}</td><td title={p.deductionDetail ?? ''}>{p.deductions}{p.deductionDetail && <div className="muted">{p.deductionDetail}</div>}</td><td>{p.adjustments}</td><td><b>{p.net}</b></td></tr>)}</tbody></table></div>
    </div>
  )
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

type Sub = null | 'fix' | 'pay' | 'face' | 'phone'
const SUBS: [Exclude<Sub, null>, string, ReactNode][] = [
  ['fix', 'Time Corrections', <IClock key="c" size={22} />], ['pay', 'Payslips', <IDoc key="d" size={22} />],
  ['face', 'My Face', <IFace key="f" size={22} />], ['phone', 'My Phone', <IPhone key="p" size={22} />],
]

function Profile({ me, onLogout, open }: { me: Me; onLogout: () => void; open: (s: Sub) => void }) {
  const initials = me.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (<>
    <section className="pm-prof"><span className="pm-av big">{initials}</span><h2>{me.name}</h2><p>{me.employeeCode}</p></section>
    <section className="pm-card pm-menu">
      {SUBS.map(([k, l, ic]) => <button key={k} onClick={() => open(k)}>{ic}<span>{l}</span><IChevR size={18} /></button>)}
      <Link to="/punch" className="pm-menu-a"><IFinger size={22} /><span>Face punch</span><IChevR size={18} /></Link>
    </section>
    <button className="pm-signout" onClick={onLogout}>Sign Out</button>
  </>)
}

export default function Portal({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState<'home' | 'att' | 'leave' | 'me'>('home')
  const [sub, setSub] = useState<Sub>(null)
  const [version, setVersion] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => { get<any[]>('/api/me/leave').then(l => setPendingCount(l.filter(x => x.status === 'PENDING').length)).catch(() => {}) }, [tab])
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const initials = me.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const pick = (t: typeof tab) => { setTab(t); setSub(null) }
  const title = sub ? SUBS.find(x => x[0] === sub)![1] : tab === 'att' ? 'My Attendance' : tab === 'leave' ? 'Leave Request' : tab === 'me' ? 'My Profile' : ''
  const NAV: [typeof tab, string, ReactNode][] = [['home', 'Home', <IHome key="h" />], ['att', 'Attendance', <ICalCheck key="a" />], ['leave', 'Leave', <ICal key="l" />], ['me', 'Profile', <IUser key="u" />]]
  return (
    <div className="pm">
      <Leaves className="pm-leaves" />
      <header className="pm-head">
        {title ? <>
          <button className="pm-back" onClick={() => sub ? setSub(null) : pick('home')} aria-label="Back"><IBack /></button><h1>{title}</h1><span style={{ width: 40 }} />
        </> : <>
          <span className="pm-av">{initials}</span>
          <div className="pm-hello"><b>{hello}, {me.name.split(' ')[0]} <span aria-hidden="true">👋</span></b><small>Employee · {me.employeeCode}</small></div>
          <button className="pm-bell" onClick={() => pick('leave')} aria-label="Leave requests"><IBell />{pendingCount > 0 && <i />}</button>
        </>}
      </header>
      <main className="pm-main">
        {tab === 'home' && !sub && <>
          <ClockWidget onChange={() => setVersion(v => v + 1)} />
          <div className="pm-tiles">
            <button onClick={() => pick('att')}><ICalCheck size={30} />My<br />Attendance</button>
            <button onClick={() => pick('leave')}><ICalPlus size={30} />Leave<br />Request</button>
            <button onClick={() => { setTab('me'); setSub('fix') }}><IClock size={30} />Time<br />Correction</button>
          </div>
          <MonthStats version={version} onAll={() => pick('att')} />
        </>}
        {tab === 'att' && !sub && <Timesheet version={version} />}
        {tab === 'leave' && !sub && <Leave />}
        {tab === 'me' && !sub && <Profile me={me} onLogout={onLogout} open={setSub} />}
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
