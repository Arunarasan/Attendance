import { FormEvent, useEffect, useState } from 'react'
import { blobUrl, del, fmtDateTime, fmtHours, fmtTime, get, post, put, today } from '../lib/api'
import type { Me } from '../App'
import EmployeesTab from './employees/EmployeesTab'

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path, ...deps])
  return { data, err, reload }
}

function Approvals() {
  const { data, err, reload } = useLoad<any[]>('/api/hr/attendance/pending')
  const [sel, setSel] = useState<number[]>([])
  const [msg, setMsg] = useState('')
  const act = async (id: number, a: 'approve' | 'reject') => {
    setMsg('')
    try { await post(`/api/hr/attendance/sessions/${id}/${a}`); reload() } catch (e: any) { setMsg(e.message) }
  }
  const many = async () => {
    const r = await post('/api/hr/attendance/sessions/approve-many', { ids: sel })
    setMsg(`Approved ${r.approved}${r.failed.length ? `. Skipped: ${r.failed.join(', ')}` : ''}`); setSel([]); reload()
  }
  return (
    <div className="card"><h2>To approve</h2>
      {err && <div className="err">{err}</div>}{msg && <div className="msg">{msg}</div>}
      {data?.length === 0 && <p className="muted">Nothing waiting. Flagged punches appear here.</p>}
      {sel.length > 0 && <p><button className="btn" onClick={many}>Approve {sel.length} selected</button></p>}
      <div className="scroll"><table>
        <thead><tr><th></th><th>Employee</th><th>Date</th><th>In → out</th><th>Why flagged</th><th></th></tr></thead>
        <tbody>{data?.map(s => (
          <tr key={s.id}>
            <td><input type="checkbox" style={{ width: 'auto' }} checked={sel.includes(s.id)} onChange={e => setSel(e.target.checked ? [...sel, s.id] : sel.filter(x => x !== s.id))} /></td>
            <td>{s.employeeName}<div className="muted">{s.employeeCode}</div></td><td>{s.workDate}</td>
            <td>{fmtTime(s.clockIn)} → {s.clockOut ? fmtTime(s.clockOut) : 'open'}<div className="muted">{s.source}</div></td>
            <td>{s.flagReason}{s.distanceMeters != null && <div className="muted">{Math.round(s.distanceMeters)} m from office</div>}</td>
            <td className="row"><button className="btn" onClick={() => act(s.id, 'approve')}>Approve</button><button className="btn ghost" onClick={() => act(s.id, 'reject')}>Reject</button></td>
          </tr>))}</tbody>
      </table></div>
    </div>
  )
}

function Register() {
  const [date, setDate] = useState(today())
  const { data } = useLoad<any[]>(`/api/hr/attendance/register?date=${date}`)
  const emps = useLoad<any[]>('/api/hr/employees').data
  const [fix, setFix] = useState({ employeeId: '', date: today(), inT: '09:00', outT: '17:00' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    try {
      await post('/api/hr/attendance/corrections/apply', { employeeId: Number(fix.employeeId), date: fix.date, checkIn: `${fix.date}T${fix.inT}:00`, checkOut: `${fix.date}T${fix.outT}:00` })
      setMsg('Time fixed and approved')
    } catch (e: any) { setErr(e.message) }
  }
  return (<>
    <div className="card"><h2>Day register</h2>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: 200 }} />
      <div className="scroll"><table><thead><tr><th>Employee</th><th>In</th><th>Out</th><th>Paid</th><th>OT</th></tr></thead>
        <tbody>{data?.map(r => <tr key={r.employeeId}><td>{r.employeeName}</td><td>{r.checkIn ? fmtTime(r.checkIn) : r.leaveType ? <span className="pill">on leave ({r.leaveType})</span> : r.holiday ? <span className="pill">{r.holiday}</span> : fmtTime(r.checkIn)}</td><td>{r.checkIn && !r.checkOut ? <span className="pill warn">open</span> : fmtTime(r.checkOut)}</td><td>{fmtHours(r.workedMinutes)}</td><td>{fmtHours(r.overtimeMinutes)}</td></tr>)}</tbody></table></div>
    </div>
    <div className="card"><h2>Fix a time</h2>
      <p className="muted">Sets the first session of that day, or creates one for a fully missed day. The fix is approved immediately. Use it to close an open past session.</p>
      <form onSubmit={submit}><div className="grid">
        <div><label>Employee</label><select value={fix.employeeId} onChange={e => setFix({ ...fix, employeeId: e.target.value })} required><option value="">Choose…</option>{emps?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div><label>Date</label><input type="date" value={fix.date} onChange={e => setFix({ ...fix, date: e.target.value })} required /></div>
        <div><label>In</label><input type="time" value={fix.inT} onChange={e => setFix({ ...fix, inT: e.target.value })} required /></div>
        <div><label>Out</label><input type="time" value={fix.outT} onChange={e => setFix({ ...fix, outT: e.target.value })} required /></div>
      </div>{err && <div className="err">{err}</div>}{msg && <div className="msg">{msg}</div>}<p><button className="btn">Apply</button></p></form>
    </div></>)
}


function Locations() {
  const { data, reload } = useLoad<any[]>('/api/hr/attendance/locations')
  const [f, setF] = useState({ name: '', latitude: '', longitude: '', radiusMeters: '100' })
  const [err, setErr] = useState('')
  const here = () => navigator.geolocation.getCurrentPosition(p => setF({ ...f, latitude: String(p.coords.latitude), longitude: String(p.coords.longitude) }), () => setErr('Location unavailable'))
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/attendance/locations', { name: f.name, latitude: Number(f.latitude), longitude: Number(f.longitude), radiusMeters: Number(f.radiusMeters) }); setF({ name: '', latitude: '', longitude: '', radiusMeters: '100' }); reload() } catch (e: any) { setErr(e.message) }
  }
  return (<div className="card"><h2>Office locations</h2>
    <p className="muted">Punches outside every active location are flagged for approval. With no locations, location is not checked.</p>
    <form onSubmit={add}><div className="grid">
      <div><label>Name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
      <div><label>Latitude</label><input value={f.latitude} onChange={e => setF({ ...f, latitude: e.target.value })} required /></div>
      <div><label>Longitude</label><input value={f.longitude} onChange={e => setF({ ...f, longitude: e.target.value })} required /></div>
      <div><label>Radius (m)</label><input type="number" min="10" value={f.radiusMeters} onChange={e => setF({ ...f, radiusMeters: e.target.value })} required /></div>
    </div>{err && <div className="err">{err}</div>}<p className="row"><button type="button" className="btn ghost" onClick={here}>Use my current location</button><button className="btn">Add</button></p></form>
    <table><thead><tr><th>Name</th><th>Lat, lng</th><th>Radius</th><th>Active</th></tr></thead>
      <tbody>{data?.map(l => <tr key={l.id}><td>{l.name}</td><td>{l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}</td><td>{l.radiusMeters} m</td>
        <td><button className="btn ghost" onClick={async () => { await put(`/api/hr/attendance/locations/${l.id}`, { active: !l.active }); reload() }}>{l.active ? 'On' : 'Off'}</button></td></tr>)}</tbody></table>
  </div>)
}

function Networks() {
  const { data, reload } = useLoad<any[]>('/api/hr/networks')
  const [f, setF] = useState({ name: '', cidr: '', bssid: '' })
  const [err, setErr] = useState('')
  const useMine = async () => { const r = await get<{ ip: string }>('/api/hr/networks/my-ip'); setF({ ...f, cidr: r.ip, name: f.name || 'Office WiFi' }) }
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/networks', f); setF({ name: '', cidr: '', bssid: '' }); reload() } catch (e: any) { setErr(e.message) }
  }
  return (<div className="card"><h2>Office WiFi</h2>
    <p className="muted">Browsers cannot read the WiFi name, so the check uses the office's public IP address (the router's). Open this page <b>while connected to the office WiFi</b> and press “Use my current network”. The Android app can also match the access point (BSSID). With nothing active here, WiFi is not checked. Punches from other networks are flagged; registering or pairing a phone is refused or held for approval.</p>
    <form onSubmit={add}><div className="grid">
      <div><label>Name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
      <div><label>Public IP or range (CIDR)</label><input value={f.cidr} placeholder="203.0.113.7 or 203.0.113.0/24" onChange={e => setF({ ...f, cidr: e.target.value })} /></div>
      <div><label>Access point BSSID (Android app)</label><input value={f.bssid} placeholder="aa:bb:cc:dd:ee:ff" onChange={e => setF({ ...f, bssid: e.target.value })} /></div>
    </div>{err && <div className="err">{err}</div>}<p className="row"><button type="button" className="btn ghost" onClick={useMine}>Use my current network</button><button className="btn">Add</button></p></form>
    <table><thead><tr><th>Name</th><th>IP / range</th><th>BSSID</th><th>Active</th><th></th></tr></thead>
      <tbody>{data?.map(n => <tr key={n.id}><td>{n.name}</td><td>{n.cidr ?? '—'}</td><td>{n.bssid ?? '—'}</td>
        <td><button className="btn ghost" onClick={async () => { await put(`/api/hr/networks/${n.id}`, { active: !n.active }); reload() }}>{n.active ? 'On' : 'Off'}</button></td>
        <td><button className="btn ghost" onClick={async () => { await del(`/api/hr/networks/${n.id}`); reload() }}>Delete</button></td></tr>)}</tbody></table></div>)
}

function RequestPhoto({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    blobUrl(`/api/hr/face-requests/${id}/photo`).then(x => { u = x; setUrl(x) }).catch(() => setUrl(null))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [id])
  return url ? <img src={url} alt="Photo sent with the request" style={{ width: 140, borderRadius: 10, transform: 'scaleX(-1)' }} /> : <span className="muted">No photo</span>
}

function PhotoRequests() {
  const { data, reload } = useLoad<any[]>('/api/hr/face-requests')
  const [err, setErr] = useState('')
  const act = async (id: number, a: 'approve' | 'reject') => {
    setErr('')
    try { await post(`/api/hr/face-requests/${id}/${a}`); reload() } catch (e: any) { setErr(e.message) }
  }
  return (<div className="card"><h2>Photo requests</h2>
    <p className="muted">The face scan failed three times, so the employee sent a photo with their ID and phone number. Check the photo really is that person before approving. Approving clocks them in or out at the time they asked, and the photo is deleted 30 days after your decision.</p>
    {err && <div className="err">{err}</div>}
    {data?.length === 0 && <p className="muted">No requests waiting.</p>}
    <div className="scroll"><table><thead><tr><th>Photo</th><th>Employee</th><th>Wants to</th><th>When</th><th>Location / WiFi</th><th></th></tr></thead>
      <tbody>{data?.map(r => <tr key={r.id}>
        <td><RequestPhoto id={r.id} /></td>
        <td>{r.employeeName}<div className="muted">{r.employeeCode}</div></td>
        <td><span className={`pill ${r.action === 'IN' ? 'ok' : 'warn'}`}>clock {r.action === 'IN' ? 'in' : 'out'}</span></td>
        <td>{fmtDateTime(r.requestedAt)}</td>
        <td>{r.context}</td>
        <td className="row"><button className="btn" onClick={() => act(r.id, 'approve')}>Approve</button><button className="btn ghost" onClick={() => act(r.id, 'reject')}>Reject</button></td>
      </tr>)}</tbody></table></div></div>)
}

function Corrections() {
  const { data, reload } = useLoad<any[]>('/api/hr/attendance/corrections')
  const [err, setErr] = useState('')
  const act = async (id: number, a: string) => { try { await post(`/api/hr/attendance/corrections/${id}/${a}`); reload() } catch (e: any) { setErr(e.message) } }
  return (<div className="card"><h2>Correction requests</h2>{err && <div className="err">{err}</div>}
    {data?.length === 0 && <p className="muted">No requests.</p>}
    <div className="scroll"><table><thead><tr><th>Employee</th><th>Date</th><th>Original</th><th>Requested</th><th>Reason</th><th></th></tr></thead>
      <tbody>{data?.map(c => <tr key={c.id}><td>{c.employeeName}</td><td>{c.workDate}</td><td>{fmtTime(c.originalIn)} – {fmtTime(c.originalOut)}</td><td>{fmtTime(c.requestedIn)} – {fmtTime(c.requestedOut)}</td><td>{c.reason}</td>
        <td className="row"><button className="btn" onClick={() => act(c.id, 'approve')}>Approve</button><button className="btn ghost" onClick={() => act(c.id, 'reject')}>Reject</button></td></tr>)}</tbody></table></div></div>)
}

function Phones() {
  const { data, reload } = useLoad<any[]>('/api/hr/attendance/devices')
  const emps = useLoad<any[]>('/api/hr/employees').data
  const name = (id: number) => emps?.find(e => e.id === id)?.name ?? id
  const act = async (id: number, a: string) => { await post(`/api/hr/attendance/devices/${id}/${a}`); reload() }
  return (<div className="card"><h2>Registered phones</h2>
    <p className="muted">One approved phone per employee. Approving a pending phone replaces the old one.</p>
    <table><thead><tr><th>Employee</th><th>Phone</th><th>Status</th><th>Added</th><th></th></tr></thead>
      <tbody>{data?.map(d => <tr key={d.id}><td>{name(d.employeeId)}</td><td>{d.label}</td><td><span className={`pill ${d.status === 'PENDING' ? 'warn' : 'ok'}`}>{d.status.toLowerCase()}</span></td><td>{fmtDateTime(d.createdAt)}</td>
        <td className="row">{d.status === 'PENDING' && <button className="btn" onClick={() => act(d.id, 'approve')}>Approve</button>}<button className="btn ghost" onClick={() => act(d.id, 'revoke')}>Revoke</button></td></tr>)}</tbody></table></div>)
}

function Kiosks() {
  const { data, reload } = useLoad<any[]>('/api/hr/kiosks')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const create = async (e: FormEvent) => { e.preventDefault(); const r = await post('/api/hr/kiosks', { name }); setCode(r.code); setName(''); reload() }
  const re = async (id: number) => { const r = await post(`/api/hr/kiosks/${id}/pair-code`); setCode(r.code) }
  return (<div className="card"><h2>Office kiosks</h2>
    <p className="muted">On the shared phone or PC open <b>/kiosk</b> and enter the code (valid 24 h, single use). Re-pairing replaces the old device.</p>
    <form className="row" onSubmit={create}><input placeholder="Kiosk name" value={name} onChange={e => setName(e.target.value)} required style={{ maxWidth: 260 }} /><button className="btn">Create</button></form>
    {code && <p>Pairing code: <span className="code">{code}</span></p>}
    <table><thead><tr><th>Name</th><th>Paired</th><th>Active</th><th></th></tr></thead>
      <tbody>{data?.map(k => <tr key={k.id}><td>{k.name}</td><td>{k.paired ? 'yes' : 'no'}</td><td>{k.active ? 'yes' : 'no'}</td>
        <td className="row">{k.active && <button className="btn ghost" onClick={() => re(k.id)}>New code</button>}{k.active && <button className="btn ghost" onClick={async () => { await del(`/api/hr/kiosks/${k.id}`); reload() }}>Deactivate</button>}</td></tr>)}</tbody></table></div>)
}

const DAYS: [string, string][] = [['MONDAY', 'Mon'], ['TUESDAY', 'Tue'], ['WEDNESDAY', 'Wed'], ['THURSDAY', 'Thu'], ['FRIDAY', 'Fri'], ['SATURDAY', 'Sat'], ['SUNDAY', 'Sun']]

function PaySettings() {
  const { data: st, reload } = useLoad<any>('/api/hr/settings')
  const rules = useLoad<any[]>('/api/hr/deductions')
  const [f, setF] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { if (st) setF({ ...st, overtimeMultiplier: String(st.overtimeMultiplier) }) }, [st])
  async function save(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    try {
      await put('/api/hr/settings', { standardDailyHours: Number(f.standardDailyHours), weeklyOffDays: f.weeklyOffDays, overtimeMultiplier: Number(f.overtimeMultiplier), defaultMode: f.defaultMode })
      setMsg('Saved'); reload()
    } catch (e: any) { setErr(e.message) }
  }
  const blank = { name: '', kind: 'PERCENT', amount: '', wageCap: '', minGross: '', maxGross: '' }
  const [r, setR] = useState(blank)
  const [rerr, setRerr] = useState('')
  const n = (v: string) => (v === '' ? null : Number(v))
  async function addRule(e: FormEvent) {
    e.preventDefault(); setRerr('')
    try { await post('/api/hr/deductions', { name: r.name, kind: r.kind, amount: Number(r.amount), wageCap: n(r.wageCap), minGross: n(r.minGross), maxGross: n(r.maxGross), active: true }); setR(blank); rules.reload() } catch (e: any) { setRerr(e.message) }
  }
  const toggle = async (x: any) => { await put(`/api/hr/deductions/${x.id}`, { ...x, active: !x.active }); rules.reload() }
  if (!f) return <div className="card muted">Loading…</div>
  const off: string[] = f.weeklyOffDays
  return (<>
    <div className="card"><h2>Pay settings</h2>
      <form onSubmit={save}>
        <div className="grid">
          <div><label>Standard hours per day</label><input type="number" min="1" max="24" value={f.standardDailyHours} onChange={e => setF({ ...f, standardDailyHours: e.target.value })} required /></div>
          <div><label>Overtime pays (× normal rate)</label><input type="number" step="0.05" min="1" max="5" value={f.overtimeMultiplier} onChange={e => setF({ ...f, overtimeMultiplier: e.target.value })} required /></div>
          <div><label>Default pay mode</label><select value={f.defaultMode} onChange={e => setF({ ...f, defaultMode: e.target.value })}><option value="HOURLY">Hourly</option><option value="MONTHLY">Monthly</option></select></div>
        </div>
        <label>Weekly off days</label>
        <div className="row">{DAYS.map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={off.includes(k)} onChange={e => setF({ ...f, weeklyOffDays: e.target.checked ? [...off, k] : off.filter(x => x !== k) })} />{l}</label>)}</div>
        <p className="muted">Hours beyond the standard day are overtime. Weekly offs are not counted as leave days and set the working days for monthly pay. Changes apply to new punches and new payroll runs; past days keep their totals.</p>
        {err && <div className="err">{err}</div>}{msg && <div className="msg">{msg}</div>}
        <p><button className="btn">Save</button></p>
      </form></div>
    <div className="card"><h2>Deductions</h2>
      <p className="muted">Each active rule is taken from gross pay on every payslip. The first three are examples and are off: rates and limits differ by country, state and year, so check them before switching one on. “Wage cap” limits what the percentage applies to; “only from / up to” make a rule apply only within a gross-pay range.</p>
      <div className="scroll"><table><thead><tr><th>Name</th><th>Rule</th><th>Wage cap</th><th>Only from</th><th>Up to</th><th>On</th><th></th></tr></thead>
        <tbody>{rules.data?.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.kind === 'PERCENT' ? `${Number(x.amount)}%` : `${Number(x.amount)} flat`}</td><td>{x.wageCap ?? '—'}</td><td>{x.minGross ?? '—'}</td><td>{x.maxGross ?? '—'}</td>
          <td><button className="btn ghost" onClick={() => toggle(x)}>{x.active ? 'On' : 'Off'}</button></td>
          <td><button className="btn ghost" onClick={async () => { await del(`/api/hr/deductions/${x.id}`); rules.reload() }}>Delete</button></td></tr>)}</tbody></table></div>
      <form onSubmit={addRule}><div className="grid">
        <div><label>Name</label><input value={r.name} onChange={e => setR({ ...r, name: e.target.value })} required /></div>
        <div><label>Kind</label><select value={r.kind} onChange={e => setR({ ...r, kind: e.target.value })}><option value="PERCENT">Percent of gross</option><option value="FIXED">Fixed amount</option></select></div>
        <div><label>{r.kind === 'PERCENT' ? 'Percent' : 'Amount'}</label><input type="number" step="0.01" min="0" value={r.amount} onChange={e => setR({ ...r, amount: e.target.value })} required /></div>
        <div><label>Wage cap (optional)</label><input type="number" min="0" value={r.wageCap} onChange={e => setR({ ...r, wageCap: e.target.value })} /></div>
        <div><label>Only if gross at least</label><input type="number" min="0" value={r.minGross} onChange={e => setR({ ...r, minGross: e.target.value })} /></div>
        <div><label>Only if gross at most</label><input type="number" min="0" value={r.maxGross} onChange={e => setR({ ...r, maxGross: e.target.value })} /></div>
      </div>{rerr && <div className="err">{rerr}</div>}<p><button className="btn">Add deduction</button></p></form></div>
  </>)
}

function Holidays() {
  const [year, setYear] = useState(new Date().getFullYear())
  const { data, reload } = useLoad<any[]>(`/api/hr/holidays?year=${year}`)
  const [f, setF] = useState({ date: '', name: '', paid: true })
  const [err, setErr] = useState('')
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/holidays', f); setF({ date: '', name: '', paid: true }); reload() } catch (e: any) { setErr(e.message) }
  }
  return (<div className="card"><h2>Holidays</h2>
    <p className="muted">A paid holiday on a normal working day pays everyone a standard day, whether or not they came in (anyone who works that day is paid for the hours too). An unpaid holiday is a day off with no pay. Holidays are not counted as leave days.</p>
    <div className="row"><label style={{ margin: 0 }}>Year</label><input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ maxWidth: 110 }} /></div>
    <form onSubmit={add}><div className="grid">
      <div><label>Date</label><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></div>
      <div><label>Name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
      <div><label>Pay</label><select value={f.paid ? 'paid' : 'unpaid'} onChange={e => setF({ ...f, paid: e.target.value === 'paid' })}><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></div>
    </div>{err && <div className="err">{err}</div>}<p><button className="btn">Add holiday</button></p></form>
    <table><thead><tr><th>Date</th><th>Name</th><th>Pay</th><th></th></tr></thead>
      <tbody>{data?.map(h => <tr key={h.id}><td>{h.holidayDate}</td><td>{h.name}</td>
        <td><button className="btn ghost" onClick={async () => { await put(`/api/hr/holidays/${h.id}`, { paid: !h.paid }); reload() }}>{h.paid ? 'Paid' : 'Unpaid'}</button></td>
        <td><button className="btn ghost" onClick={async () => { await del(`/api/hr/holidays/${h.id}`); reload() }}>Delete</button></td></tr>)}</tbody></table></div>)
}

function LeaveAdmin() {
  const reqs = useLoad<any[]>('/api/hr/leave/requests?status=PENDING')
  const types = useLoad<any[]>('/api/hr/leave/types')
  const emps = useLoad<any[]>('/api/hr/employees').data
  const [err, setErr] = useState('')
  const act = async (id: number, a: 'approve' | 'reject') => { setErr(''); try { await post(`/api/hr/leave/requests/${id}/${a}`); reqs.reload() } catch (e: any) { setErr(e.message) } }

  const [f, setF] = useState({ employeeId: '', leaveTypeId: '', startDate: today(), endDate: today(), halfDay: false, reason: '' })
  const [ferr, setFerr] = useState('')
  const [fok, setFok] = useState('')
  async function apply(e: FormEvent) {
    e.preventDefault(); setFerr(''); setFok('')
    try { await post('/api/hr/leave/requests', { ...f, employeeId: Number(f.employeeId), leaveTypeId: Number(f.leaveTypeId), halfDay: f.halfDay && f.startDate === f.endDate }); setFok('Recorded and approved') } catch (e: any) { setFerr(e.message) }
  }

  const [t, setT] = useState({ code: '', name: '', paid: true, annualQuota: '0' })
  const [terr, setTerr] = useState('')
  async function addType(e: FormEvent) {
    e.preventDefault(); setTerr('')
    try { await post('/api/hr/leave/types', { ...t, annualQuota: Number(t.annualQuota) }); setT({ code: '', name: '', paid: true, annualQuota: '0' }); types.reload() } catch (e: any) { setTerr(e.message) }
  }
  const editQuota = async (x: any) => {
    const v = prompt(`Days per year for ${x.name} (0 = no limit)`, String(Number(x.annualQuota)))
    if (v === null || isNaN(Number(v))) return
    await put(`/api/hr/leave/types/${x.id}`, { annualQuota: Number(v) }); types.reload()
  }
  return (<>
    <div className="card"><h2>Leave requests</h2>{err && <div className="err">{err}</div>}
      {reqs.data?.length === 0 && <p className="muted">Nothing waiting.</p>}
      <div className="scroll"><table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th></th></tr></thead>
        <tbody>{reqs.data?.map(r => <tr key={r.id}><td>{r.employeeName}<div className="muted">{r.employeeCode}</div></td><td>{r.leaveName}<div className="muted">{r.paid ? 'paid' : 'unpaid'}</div></td>
          <td>{r.startDate}{r.endDate !== r.startDate && ` → ${r.endDate}`}{r.halfDay && ' (half)'}</td><td>{Number(r.days)}</td><td>{r.reason}</td>
          <td className="row"><button className="btn" onClick={() => act(r.id, 'approve')}>Approve</button><button className="btn ghost" onClick={() => act(r.id, 'reject')}>Reject</button></td></tr>)}</tbody></table></div></div>
    <div className="card"><h2>Record leave for someone</h2>
      <p className="muted">For example a phone call in sick. It is approved straight away and counts toward their balance.</p>
      <form onSubmit={apply}><div className="grid">
        <div><label>Employee</label><select value={f.employeeId} onChange={e => setF({ ...f, employeeId: e.target.value })} required><option value="">Choose…</option>{emps?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div><label>Type</label><select value={f.leaveTypeId} onChange={e => setF({ ...f, leaveTypeId: e.target.value })} required><option value="">Choose…</option>{types.data?.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><label>From</label><input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} required /></div>
        <div><label>To</label><input type="date" value={f.endDate} min={f.startDate} onChange={e => setF({ ...f, endDate: e.target.value })} required /></div>
      </div>
      {f.startDate === f.endDate && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.halfDay} onChange={e => setF({ ...f, halfDay: e.target.checked })} /> Half day</label>}
      <label>Reason</label><input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} />
      {ferr && <div className="err">{ferr}</div>}{fok && <div className="msg">{fok}</div>}<p><button className="btn">Record</button></p></form></div>
    <div className="card"><h2>Leave types</h2>
      <p className="muted">Paid types are paid at a standard day per leave day. Unpaid types are not. A limit of 0 means no yearly limit.</p>
      <table><thead><tr><th>Code</th><th>Name</th><th>Pay</th><th>Days / year</th><th>On</th><th></th></tr></thead>
        <tbody>{types.data?.map(x => <tr key={x.id}><td>{x.code}</td><td>{x.name}</td>
          <td><button className="btn ghost" onClick={async () => { await put(`/api/hr/leave/types/${x.id}`, { paid: !x.paid }); types.reload() }}>{x.paid ? 'Paid' : 'Unpaid'}</button></td>
          <td>{Number(x.annualQuota) > 0 ? Number(x.annualQuota) : 'no limit'}</td>
          <td><button className="btn ghost" onClick={async () => { await put(`/api/hr/leave/types/${x.id}`, { active: !x.active }); types.reload() }}>{x.active ? 'On' : 'Off'}</button></td>
          <td><button className="btn ghost" onClick={() => editQuota(x)}>Set limit</button></td></tr>)}</tbody></table>
      <form onSubmit={addType}><div className="grid">
        <div><label>Code</label><input value={t.code} maxLength={12} onChange={e => setT({ ...t, code: e.target.value })} required /></div>
        <div><label>Name</label><input value={t.name} onChange={e => setT({ ...t, name: e.target.value })} required /></div>
        <div><label>Pay</label><select value={t.paid ? 'paid' : 'unpaid'} onChange={e => setT({ ...t, paid: e.target.value === 'paid' })}><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></div>
        <div><label>Days per year (0 = no limit)</label><input type="number" min="0" step="0.5" value={t.annualQuota} onChange={e => setT({ ...t, annualQuota: e.target.value })} /></div>
      </div>{terr && <div className="err">{terr}</div>}<p><button className="btn">Add leave type</button></p></form></div>
  </>)
}

function Payroll() {
  const { data, reload } = useLoad<any[]>('/api/hr/payroll/runs')
  const [period, setPeriod] = useState(today().slice(0, 7))
  const [mode, setMode] = useState('HOURLY')
  useEffect(() => { get('/api/hr/settings').then(s => setMode(s.defaultMode)).catch(() => {}) }, [])
  const [err, setErr] = useState('')
  const [run, setRun] = useState<number | null>(null)
  const slips = useLoad<any[]>(run ? `/api/hr/payroll/runs/${run}/payslips` : '/api/hr/payroll/runs', [run])
  async function gen(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { const r = await post('/api/hr/payroll/generate', { period, mode }); setRun(r.runId); reload() } catch (e: any) { setErr(e.message) }
  }
  const adjust = async (id: number) => {
    const v = prompt('Adjustment amount (negative for a deduction)')
    if (v === null || isNaN(Number(v))) return
    await post(`/api/hr/payroll/payslips/${id}/adjust`, { amount: Number(v) }); slips.reload()
  }
  return (<>
    <div className="card"><h2>Generate payroll</h2>
      <p className="muted">Pay comes from approved attendance hours, plus a standard day for each paid holiday and each paid leave day. Resolve everything in “To approve” and “Leave” first. Monthly = base ÷ (standard hours × working days) × hours, capped at base, plus overtime. Deductions come from Pay settings.</p>
      <form className="row" onSubmit={gen}><input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ maxWidth: 180 }} />
        <select value={mode} onChange={e => setMode(e.target.value)} style={{ maxWidth: 160 }}><option value="HOURLY">Hourly</option><option value="MONTHLY">Monthly</option></select><button className="btn">Generate</button></form>
      {err && <div className="err">{err}</div>}
      <table><thead><tr><th>Period</th><th>Mode</th><th>Created</th><th></th></tr></thead>
        <tbody>{data?.map(r => <tr key={r.id}><td>{r.period}</td><td>{r.mode}</td><td>{fmtDateTime(r.createdAt)}</td><td><button className="btn ghost" onClick={() => setRun(r.id)}>View</button></td></tr>)}</tbody></table></div>
    {run && slips.data && <div className="card"><h2>Payslips</h2><div className="scroll"><table><thead><tr><th>Employee</th><th>Hours</th><th>OT</th><th>Leave / holiday</th><th>Gross</th><th>Deductions</th><th>Adjust</th><th>Net</th><th></th></tr></thead>
      <tbody>{(slips.data as any[]).map(p => <tr key={p.id}><td>{p.employeeName}</td><td>{p.regularHours} h{Number(p.creditHours) > 0 && <div className="muted">incl. {p.creditHours} h credit</div>}</td><td>{p.overtimeHours} h</td><td>{Number(p.paidLeaveDays)} leave · {Number(p.holidayDays)} holiday{Number(p.unpaidLeaveDays) > 0 && <div className="muted">{Number(p.unpaidLeaveDays)} d unpaid</div>}</td><td>{p.gross}</td><td title={p.deductionDetail ?? ''}>{p.deductions}{p.deductionDetail && <div className="muted">{p.deductionDetail}</div>}</td><td>{p.adjustments}</td><td><b>{p.net}</b></td><td><button className="btn ghost" onClick={() => adjust(p.id)}>Adjust</button></td></tr>)}</tbody></table></div></div>}
  </>)
}

const TABS: [string, string, () => JSX.Element][] = [
  ['approve', 'To approve', Approvals], ['photo', 'Photo requests', PhotoRequests], ['register', 'Register', Register], ['emps', 'Employees', () => <></>],
  ['loc', 'Locations', Locations], ['net', 'WiFi', Networks], ['fix', 'Corrections', Corrections], ['phones', 'Phones', Phones],
  ['kiosks', 'Kiosks', Kiosks], ['leave', 'Leave', LeaveAdmin], ['holidays', 'Holidays', Holidays], ['pay', 'Payroll', Payroll], ['paycfg', 'Pay settings', PaySettings],
]

export default function Hr({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState('approve')
  const Cur = TABS.find(t => t[0] === tab)![2]
  return (<>
    <header className="top"><b>HR · {me.name}</b><button className="btn ghost" onClick={onLogout}>Sign out</button></header>
    <div className="wrap">
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'emps' ? <EmployeesTab meId={me.id} /> : <Cur />}
    </div></>)
}
