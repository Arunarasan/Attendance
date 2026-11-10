import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { fmtHours, fmtTime, get, post, today } from '../lib/api'
import { IArrowR, ICal, ICalCheck, ICheckCircle, IClock, IEdit, ISearch, IUmbrella, IUsers, IX } from '../components/icons'
import './leaveHolidays.css'
import './attendanceAdmin.css'

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path])
  return { data, err, reload }
}

const initials = (name: string) => (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
const shift = (d: string, n: number) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }

type Row = { employeeId: number; employeeName: string; employeeCode: string; checkIn: string | null; checkOut: string | null; workedMinutes: number | null; overtimeMinutes: number | null; leaveType: string | null; holiday: string | null }
type Status = 'present' | 'open' | 'leave' | 'holiday' | 'absent'
const statusOf = (r: Row, isToday: boolean): Status =>
  r.checkIn ? (r.checkOut ? 'present' : isToday ? 'present' : 'open') : r.leaveType ? 'leave' : r.holiday ? 'holiday' : 'absent'
const LABEL: Record<Status, string> = { present: 'Present', open: 'No check-out', leave: 'On leave', holiday: 'Holiday', absent: 'Absent' }

export function Register() {
  const [date, setDate] = useState(today())
  const { data, reload } = useLoad<Row[]>(`/api/hr/attendance/register?date=${date}`)
  const emps = useLoad<any[]>('/api/hr/employees').data
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [fix, setFix] = useState({ employeeId: '', date: today(), inT: '09:00', outT: '17:00' })
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const panel = useRef<HTMLFormElement>(null)
  const isToday = date === today()

  const rows = useMemo(() => (data ?? []).map(r => ({ r, s: statusOf(r, isToday) })), [data, isToday])
  const count = (s: Status) => rows.filter(x => x.s === s).length
  const shown = rows.filter(x => (filter === 'all' || x.s === filter) && (q === '' || (x.r.employeeName + x.r.employeeCode).toLowerCase().includes(q.toLowerCase())))
  const present = count('present') + count('open')

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    try {
      await post('/api/hr/attendance/corrections/apply', { employeeId: Number(fix.employeeId), date: fix.date, checkIn: `${fix.date}T${fix.inT}:00`, checkOut: `${fix.date}T${fix.outT}:00` })
      setMsg('Time fixed and approved'); reload()
    } catch (e: any) { setErr(e.message) }
  }
  const startFix = (r: Row) => {
    setFix({ employeeId: String(r.employeeId), date, inT: r.checkIn ? r.checkIn.slice(11, 16) : '09:00', outT: r.checkOut ? r.checkOut.slice(11, 16) : '17:00' })
    setOpen(true); setMsg(''); setErr('')
    setTimeout(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  return (<>
    <div className="at-bar">
      <div className="at-date">
        <button onClick={() => setDate(shift(date, -1))} aria-label="Previous day">‹</button>
        <label><ICal size={18} /><b>{new Date(date + 'T00:00').toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</b>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></label>
        <button onClick={() => setDate(shift(date, 1))} aria-label="Next day">›</button>
        {!isToday && <button className="at-today" onClick={() => setDate(today())}>Today</button>}
      </div>
      <button className="lh-add" onClick={() => { setOpen(o => !o); setMsg(''); setErr('') }}>{open ? 'Close' : <><IEdit size={16} /> Fix a time</>}</button>
    </div>

    {open && <form ref={panel} className="lh-card lh-form" onSubmit={submit}>
      <h3 style={{ margin: '0 0 2px' }}>Fix a time</h3>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>Sets the first session of that day, or creates one for a fully missed day. It is approved immediately. Use it to close an open past session.</p>
      <div className="grid">
        <div><label>Employee</label><select value={fix.employeeId} onChange={e => setFix({ ...fix, employeeId: e.target.value })} required><option value="">Choose…</option>{emps?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div><label>Date</label><input type="date" value={fix.date} onChange={e => setFix({ ...fix, date: e.target.value })} required /></div>
        <div><label>In</label><input type="time" value={fix.inT} onChange={e => setFix({ ...fix, inT: e.target.value })} required /></div>
        <div><label>Out</label><input type="time" value={fix.outT} onChange={e => setFix({ ...fix, outT: e.target.value })} required /></div>
      </div>
      {err && <div className="err">{err}</div>}{msg && <div className="msg">{msg}</div>}
      <p style={{ marginBottom: 0 }}><button className="btn">Apply</button></p>
    </form>}

    <div className="at-stats">
      <button className={`at-stat g${filter === 'present' ? ' on' : ''}`} onClick={() => setFilter(filter === 'present' ? 'all' : 'present')}><span><ICheckCircle size={22} /></span><b>{present}</b><small>Present</small></button>
      <button className={`at-stat y${filter === 'leave' ? ' on' : ''}`} onClick={() => setFilter(filter === 'leave' ? 'all' : 'leave')}><span><IUmbrella size={22} /></span><b>{count('leave')}</b><small>On leave</small></button>
      <button className={`at-stat r${filter === 'absent' ? ' on' : ''}`} onClick={() => setFilter(filter === 'absent' ? 'all' : 'absent')}><span><IX size={22} /></span><b>{count('absent')}</b><small>Absent</small></button>
      <button className={`at-stat o${filter === 'open' ? ' on' : ''}`} onClick={() => setFilter(filter === 'open' ? 'all' : 'open')}><span><IClock size={22} /></span><b>{count('open')}</b><small>No check-out</small></button>
    </div>

    <section className="lh-sec">
      <div className="at-search"><ISearch size={18} /><input placeholder="Search employee name or ID" value={q} onChange={e => setQ(e.target.value)} />
        {filter !== 'all' && <button onClick={() => setFilter('all')}>Clear filter: {LABEL[filter]} ×</button>}</div>
      {data && shown.length === 0 && <div className="lh-empty"><IUsers size={34} /><b>No one to show</b><small>Try a different day, filter or search.</small></div>}
      <div className="at-list">
        {shown.map(({ r, s }) => (
          <div key={r.employeeId} className={`at-row ${s}`}>
            <span className="lh-av">{initials(r.employeeName)}</span>
            <div className="at-who"><b>{r.employeeName}</b><small>{r.employeeCode}</small></div>
            <div className="at-times">
              {r.checkIn ? <><span className="at-t"><em>In</em>{fmtTime(r.checkIn)}</span><IArrowR size={14} /><span className="at-t"><em>Out</em>{r.checkOut ? fmtTime(r.checkOut) : '—'}</span></>
                : <span className="at-note">{r.leaveType ? `On leave (${r.leaveType})` : r.holiday ?? 'No punch'}</span>}
            </div>
            <div className="at-hours">{r.checkIn ? <><b>{fmtHours(r.workedMinutes)}</b>{(r.overtimeMinutes ?? 0) > 0 && <small>OT {fmtHours(r.overtimeMinutes)}</small>}</> : null}</div>
            <span className={`at-badge ${s}`}>{LABEL[s]}</span>
            <button className="at-fix" onClick={() => startFix(r)} aria-label={`Fix time for ${r.employeeName}`}><IEdit size={16} /></button>
          </div>))}
      </div>
    </section>
  </>)
}

export function Corrections() {
  const { data, reload } = useLoad<any[]>('/api/hr/attendance/corrections')
  const [err, setErr] = useState('')
  const act = async (id: number, a: 'approve' | 'reject') => { setErr(''); try { await post(`/api/hr/attendance/corrections/${id}/${a}`); reload() } catch (e: any) { setErr(e.message) } }
  return (<>
    <div className="lh-stats" style={{ gridTemplateColumns: '1fr' }}>
      <div className="lh-stat y"><span><IClock size={26} /></span><b>{data?.length ?? 0}</b><small>Correction requests waiting</small></div>
    </div>
    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>Correction requests</h3><p>Employees ask to change a day's check-in and check-out time. Compare the times, then approve or reject.</p></div></div>
      {err && <div className="err">{err}</div>}
      {data?.length === 0 && <div className="lh-empty"><ICalCheck size={34} /><b>All caught up</b><small>No correction requests.</small></div>}
      <div className="lh-reqs">
        {data?.map(c => (
          <div key={c.id} className="lh-req">
            <span className="lh-av">{initials(c.employeeName)}</span>
            <div className="lh-req-m">
              <b>{c.employeeName}</b>
              <div className="lh-req-d"><ICal size={16} />{new Date(c.workDate + 'T00:00').toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
              <div className="at-cmp">
                <div><small>Original</small><b>{fmtTime(c.originalIn)} – {fmtTime(c.originalOut)}</b></div>
                <IArrowR size={18} />
                <div className="new"><small>Requested</small><b>{fmtTime(c.requestedIn)} – {fmtTime(c.requestedOut)}</b></div>
              </div>
              {c.reason && <q>{c.reason}</q>}
            </div>
            <div className="lh-req-a">
              <button className="lh-ok" onClick={() => act(c.id, 'approve')}><ICheckCircle size={18} />Approve</button>
              <button className="lh-no" onClick={() => act(c.id, 'reject')}><IX size={18} />Reject</button>
            </div>
          </div>))}
      </div>
    </section>
  </>)
}
