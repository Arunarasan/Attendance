import { useEffect, useState } from 'react'
import { fmtHours, fmtTime, get, today } from '../lib/api'
import './attendanceReport.css'

type Cell = { date: string; status: string; checkIn: string | null; checkOut: string | null; workedMinutes: number; overtimeMinutes: number; note: string | null }
type Line = { id: number; name: string; code: string; active: boolean; cells: Cell[]; present: number; noCheckout: number; leave: number; holiday: number; weeklyOff: number; absent: number; workedMinutes: number; overtimeMinutes: number }
type Report = { month: string; days: string[]; employees: Line[] }

const NAME: Record<string, string> = { P: 'Present', N: 'No check-out', L: 'Leave', H: 'Holiday', W: 'Weekly off', A: 'Absent', F: '' }
const mark = (c: Cell) => c.status === 'F' ? '' : c.status === 'N' ? 'P*' : c.status
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = (m: string) => new Date(m + '-01T00:00').toLocaleDateString([], { month: 'long', year: 'numeric' })
const dayLabel = (d: string) => new Date(d + 'T00:00').toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' })
const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

function download(name: string, rows: unknown[][]) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

/** employeeId omitted = the whole-company monthly register; given = that employee's day-by-day report. */
export default function AttendanceReport({ employeeId }: { employeeId?: number }) {
  const [month, setMonth] = useState(today().slice(0, 7))
  const [data, setData] = useState<Report | null>(null)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    setData(null); setErr('')
    get<Report>(`/api/hr/attendance/report?month=${month}${employeeId ? `&employeeId=${employeeId}` : ''}`).then(setData).catch(e => setErr(e.message))
  }, [month, employeeId])

  const lines = (data?.employees ?? []).filter(l => !search || (l.name + l.code).toLowerCase().includes(search.toLowerCase()))

  function exportCsv() {
    if (!data) return
    if (employeeId) {
      const l = data.employees[0]
      download(`attendance-${l.code}-${month}.csv`, [['Date', 'Status', 'Check in', 'Check out', 'Worked (min)', 'Overtime (min)', 'Note'],
        ...l.cells.filter(c => c.status !== 'F').map(c => [c.date, NAME[c.status], c.checkIn ? fmtTime(c.checkIn) : '', c.checkOut ? fmtTime(c.checkOut) : '', c.workedMinutes, c.overtimeMinutes, c.note ?? ''])])
    } else {
      download(`attendance-register-${month}.csv`, [['Employee ID', 'Name', ...data.days.map(d => d.slice(8)), 'Present', 'Leave', 'Holiday', 'Weekly off', 'Absent', 'Worked hours', 'Overtime hours'],
        ...lines.map(l => [l.code, l.name, ...l.cells.map(mark), l.present + l.noCheckout, l.leave, l.holiday, l.weeklyOff, l.absent, (l.workedMinutes / 60).toFixed(2), (l.overtimeMinutes / 60).toFixed(2)])])
    }
  }

  const bar = (<div className="ar-bar">
    <div className="ar-month"><button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
      <b>{monthLabel(month)}</b><button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button></div>
    {!employeeId && <input className="ar-search" aria-label="Search employees" placeholder="Search name or ID" value={search} onChange={e => setSearch(e.target.value)} />}
    <div className="ar-actions"><button className="btn ghost" disabled={!data} onClick={exportCsv}>Download CSV</button>
      <button className="btn ghost" onClick={() => window.print()}>Print</button></div>
  </div>)

  if (err) return <>{bar}<div className="err">{err}</div></>
  if (!data) return <>{bar}<p className="muted">Loading…</p></>

  if (employeeId) {
    const l = data.employees[0]
    return (<div className="ar ar-one">{bar}
      <div className="ar-sum">
        <div className="g"><b>{l.present + l.noCheckout}</b><small>Present</small></div>
        <div className="r"><b>{l.absent}</b><small>Absent</small></div>
        <div className="y"><b>{l.leave}</b><small>Leave</small></div>
        <div><b>{fmtHours(l.workedMinutes)}</b><small>Worked{l.overtimeMinutes > 0 ? ` · OT ${fmtHours(l.overtimeMinutes)}` : ''}</small></div>
      </div>
      <table className="ar-days"><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th></tr></thead>
        <tbody>{l.cells.filter(c => c.status !== 'F').map(c => (
          <tr key={c.date}><td>{dayLabel(c.date)}</td><td><span className={`ar-pill s${c.status}`}>{NAME[c.status]}{c.note ? ` (${c.note})` : ''}</span></td>
            <td>{c.checkIn ? fmtTime(c.checkIn) : '—'}</td><td>{c.checkOut ? fmtTime(c.checkOut) : '—'}</td><td>{c.checkIn ? fmtHours(c.workedMinutes) : ''}</td></tr>))}</tbody></table>
    </div>)
  }

  return (<div className="ar">
    <h2 className="ar-print-title">Attendance register — {monthLabel(month)}</h2>
    {bar}
    <div className="ar-legend"><span className="sP">P</span> Present <span className="sN">P*</span> No check-out <span className="sL">L</span> Leave <span className="sH">H</span> Holiday <span className="sW">W</span> Weekly off <span className="sA">A</span> Absent</div>
    <div className="ar-scroll"><table className="ar-grid">
      <thead><tr><th className="nm">Employee</th>{data.days.map(d => <th key={d} title={dayLabel(d)}>{d.slice(8)}</th>)}<th>P</th><th>L</th><th>H</th><th>W</th><th>A</th><th>Hrs</th></tr></thead>
      <tbody>{lines.map(l => (<tr key={l.id}>
        <td className="nm"><b>{l.name}</b><small>{l.code}</small></td>
        {l.cells.map(c => <td key={c.date} className={`c s${c.status}`} title={`${dayLabel(c.date)} — ${NAME[c.status]}${c.checkIn ? ` ${fmtTime(c.checkIn)}–${c.checkOut ? fmtTime(c.checkOut) : '?'}` : ''}`}>{mark(c)}</td>)}
        <td>{l.present + l.noCheckout}</td><td>{l.leave}</td><td>{l.holiday}</td><td>{l.weeklyOff}</td><td>{l.absent}</td><td>{(l.workedMinutes / 60).toFixed(1)}</td></tr>))}</tbody></table></div>
    {lines.length === 0 && <p className="muted">No employees to show.</p>}
  </div>)
}
