import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtDateTime, fmtHours, fmtTime, get, post, today } from '../lib/api'
import { getBestPosition } from '../lib/geo'
import { hasLocalKey, publicKeyB64, signNonce, wifiBssid } from '../lib/deviceKey'
import FaceCapture from '../components/FaceCapture'
import FaceEnrol from './FaceEnrol'
import type { Me } from '../App'

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
  return (
    <div className="card">
      <div className="clock">{now.toLocaleTimeString()}</div>
      {data && (
        <div className="grid">
          {!data.isOpen && <button className="btn big" disabled={busy} onClick={() => punch('in')}>{data.sessions.length ? 'Clock in again' : 'Clock in'}</button>}
          {data.isOpen && <button className="btn big danger" disabled={busy} onClick={() => punch('out')}>Clock out</button>}
          {data.isOpen && !data.onBreak && <button className="btn big ghost" disabled={busy} onClick={() => punch('break-start')}>Start break</button>}
          {data.isOpen && data.onBreak && <button className="btn big ghost" disabled={busy} onClick={() => punch('break-end')}>End break</button>}
        </div>
      )}
      {err && <div className="err">{err}</div>}
      {note && <div className="msg">{note}</div>}
      {day && <p className="muted">Today paid so far: {fmtHours(day.workedMinutes)}{day.overtimeMinutes > 0 && ` (overtime ${fmtHours(day.overtimeMinutes)})`}</p>}
      {data?.sessions.map(s => (
        <div key={s.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', padding: '6px 0' }}>
          <span>{fmtTime(s.clockIn)} → {s.clockOut ? fmtTime(s.clockOut) : 'open'}{s.breakMinutes > 0 && ` · break ${s.breakMinutes}m`}</span>
          <span className={`pill ${s.approvalStatus === 'APPROVED' ? 'ok' : 'warn'}`} title={s.flagReason ?? ''}>{s.approvalStatus.toLowerCase()}</span>
        </div>
      ))}
    </div>
  )
}

function Timesheet({ version }: { version: number }) {
  const [month, setMonth] = useState(today().slice(0, 7))
  const [days, setDays] = useState<any[]>([])
  useEffect(() => { get(`/api/me/timesheet?month=${month}`).then(r => setDays(r.days)) }, [month, version])
  const total = days.reduce((a, d) => a + d.workedMinutes, 0)
  const ot = days.reduce((a, d) => a + d.overtimeMinutes, 0)
  return (
    <div className="card">
      <h2>Timesheet</h2>
      <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ maxWidth: 200 }} />
      <p className="muted">Paid hours {fmtHours(total)} · overtime {fmtHours(ot)}</p>
      <div className="scroll"><table>
        <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Break</th><th>Paid</th><th>OT</th></tr></thead>
        <tbody>{days.map(d => (
          <tr key={d.workDate}><td>{d.workDate}</td><td>{fmtTime(d.checkIn)}</td><td>{fmtTime(d.checkOut)}</td><td>{d.breakMinutes}m</td><td>{fmtHours(d.workedMinutes)}</td><td>{fmtHours(d.overtimeMinutes)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  )
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
        <p><button className="btn">Send request</button></p>
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

export default function Portal({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState('clock')
  const [version, setVersion] = useState(0)
  return (
    <>
      <header className="top"><b>Hi, {me.name}</b><span className="row"><Link to="/punch">Face punch</Link><button className="btn ghost" onClick={onLogout}>Sign out</button></span></header>
      <div className="wrap">
        <div className="tabs">
          {[['clock', 'Clock'], ['sheet', 'Timesheet'], ['fix', 'Corrections'], ['leave', 'Leave'], ['pay', 'Payslips'], ['face', 'My face'], ['phone', 'My phone']].map(([k, l]) =>
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'clock' && <ClockWidget onChange={() => setVersion(v => v + 1)} />}
        {tab === 'sheet' && <Timesheet version={version} />}
        {tab === 'fix' && <Corrections />}
        {tab === 'leave' && <Leave />}
        {tab === 'pay' && <Payslips />}
        {tab === 'face' && <MyFace me={me} />}
        {tab === 'phone' && <Phone />}
      </div>
    </>
  )
}
