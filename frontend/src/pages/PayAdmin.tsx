import { FormEvent, useEffect, useMemo, useState } from 'react'
import { del, fmtDateTime, get, post, put, today } from '../lib/api'
import { IAlert, ICal, ICheckCircle, IClock, IWallet, IUsers } from '../components/icons'
import './leaveHolidays.css'
import './attendanceAdmin.css'
import './approvalsAdmin.css'
import './locationsAdmin.css'
import './payAdmin.css'

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path, ...deps])
  return { data, err, reload }
}
const initials = (name: string) => (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
const money = (v: any) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DAYS: [string, string][] = [['MONDAY', 'Mon'], ['TUESDAY', 'Tue'], ['WEDNESDAY', 'Wed'], ['THURSDAY', 'Thu'], ['FRIDAY', 'Fri'], ['SATURDAY', 'Sat'], ['SUNDAY', 'Sun']]
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

function Card({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>{right}</div>
      {children}
    </section>
  )
}
function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button type="button" className={`lh-tg${on ? ' on' : ''}`} onClick={onClick}><i />{label}</button>
}
function Num({ label, value, onChange, unit, min = 0, max, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <div className="pa-num"><label>{label}</label>
      <div><input type="number" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />{unit && <em>{unit}</em>}</div>
      {hint && <small>{hint}</small>}</div>
  )
}

/* ============ Pay settings ============ */

type Pol = {
  workingDaysBasis: string; otAfterMinutes: number; otDailyCapMinutes: number; lopEnabled: boolean; graceMinutes: number; halfDayMinMinutes: number
  shiftStart: string; lateGraceMinutes: number; lateCountForHalfDay: number; wAttendance: number; wPunctuality: number; wHours: number; wDiscipline: number
  bonusMinScore: number; bonusAmount: number
}

export function PaySettings() {
  const stL = useLoad<any>('/api/hr/settings')
  const polL = useLoad<Pol>('/api/hr/policy')
  const [st, setSt] = useState<any>(null)
  const [pol, setPol] = useState<Pol | null>(null)
  const [saved, setSaved] = useState('')
  const [sec, setSec] = useState<'pay' | 'time' | 'lop' | 'score' | 'ded'>('pay')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { if (stL.data) setSt({ ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) }); setSaved('') }, [stL.data])
  useEffect(() => { if (polL.data) { const p = { ...polL.data, shiftStart: String(polL.data.shiftStart).slice(0, 5), bonusAmount: Number(polL.data.bonusAmount) }; setPol(p) } }, [polL.data])
  const snap = (s: any, p: any) => JSON.stringify([s, p])
  const orig = useMemo(() => (stL.data && polL.data ? snap({ ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) }, { ...polL.data, shiftStart: String(polL.data.shiftStart).slice(0, 5), bonusAmount: Number(polL.data.bonusAmount) }) : ''), [stL.data, polL.data])
  const dirty = !!(st && pol) && snap(st, pol) !== orig && saved !== snap(st, pol)

  async function save() {
    setErr(''); setMsg('')
    try {
      await put('/api/hr/settings', { standardDailyHours: Number(st.standardDailyHours), weeklyOffDays: st.weeklyOffDays, overtimeMultiplier: Number(st.overtimeMultiplier), defaultMode: st.defaultMode })
      await put('/api/hr/policy', { ...pol, shiftStart: pol!.shiftStart.length === 5 ? pol!.shiftStart + ':00' : pol!.shiftStart })
      setMsg('Saved. New rules apply to payroll runs generated from now on.'); setSaved(snap(st, pol)); stL.reload(); polL.reload()
    } catch (e: any) { setErr(e.message) }
  }
  const discard = () => { setSt({ ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) }); setPol({ ...polL.data!, shiftStart: String(polL.data!.shiftStart).slice(0, 5), bonusAmount: Number(polL.data!.bonusAmount) }) }

  if (!st || !pol) return <div className="lh-sec muted">Loading…</div>
  const P = (patch: Partial<Pol>) => setPol({ ...pol, ...patch })
  const std = Number(st.standardDailyHours) * 60
  const lateAfter = (() => { const [h, m] = pol.shiftStart.split(':').map(Number); const t = h * 60 + m + pol.lateGraceMinutes; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` })()
  const wsum = pol.wAttendance + pol.wPunctuality + pol.wHours + pol.wDiscipline
  const off: string[] = st.weeklyOffDays

  const st0: any = stL.data ? { ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) } : {}
  const pol0: any = polL.data ?? {}
  const diff = (sk: string[], pk: string[]) => sk.some(k => JSON.stringify(st[k]) !== JSON.stringify(st0[k])) || pk.some(k => JSON.stringify((pol as any)[k]) !== JSON.stringify(k === 'shiftStart' ? String(pol0[k]).slice(0, 5) : k === 'bonusAmount' ? Number(pol0[k]) : pol0[k]))
  const SECTIONS: { key: typeof sec; label: string; hint: string; icon: React.ReactNode; dirty: boolean }[] = [
    { key: 'pay', label: 'Pay & overtime', hint: 'Mode, divisor, overtime', icon: <IWallet size={20} />, dirty: diff(['defaultMode', 'overtimeMultiplier'], ['workingDaysBasis', 'otAfterMinutes', 'otDailyCapMinutes']) },
    { key: 'time', label: 'Work time', hint: 'Hours and weekly off', icon: <IClock size={20} />, dirty: diff(['standardDailyHours', 'weeklyOffDays'], []) },
    { key: 'lop', label: 'Loss of pay', hint: pol.lopEnabled ? 'Rules on' : 'Rules off', icon: <IAlert size={20} />, dirty: diff([], ['lopEnabled', 'graceMinutes', 'halfDayMinMinutes', 'shiftStart', 'lateGraceMinutes', 'lateCountForHalfDay']) },
    { key: 'score', label: 'Honour score', hint: 'Weights and bonus', icon: <ICheckCircle size={20} />, dirty: diff([], ['wAttendance', 'wPunctuality', 'wHours', 'wDiscipline', 'bonusMinScore', 'bonusAmount']) },
    { key: 'ded', label: 'Deductions', hint: 'Taken from gross pay', icon: <IUsers size={20} />, dirty: false },
  ]
  const offNames = off.length ? DAYS.filter(([k]) => off.includes(k)).map(([, l]) => l).join(', ') : 'none'
  return (<>
    <div className="ps-summary">
      <span><IWallet size={16} />{st.defaultMode === 'MONTHLY' ? 'Monthly' : 'Hourly'} by default</span>
      <span><IClock size={16} />{st.standardDailyHours} h day</span>
      <span>Overtime ×{Number(st.overtimeMultiplier)}</span>
      <span><ICal size={16} />Off: {offNames}</span>
      <span className={pol.lopEnabled ? 'on' : ''}>Loss of pay {pol.lopEnabled ? 'on' : 'off'}</span>
      {pol.bonusMinScore > 0 && <span className="on">Bonus {money(pol.bonusAmount)} at score {pol.bonusMinScore}+</span>}
    </div>

    <div className="ps-layout">
      <nav className="ps-nav" aria-label="Pay settings sections">
        {SECTIONS.map(x => (
          <button key={x.key} type="button" className={sec === x.key ? 'on' : ''} onClick={e => { setSec(x.key); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }) }}>
            <span className="ps-nav-ic">{x.icon}</span><span className="ps-nav-t"><b>{x.label}</b><small>{x.hint}</small></span>{x.dirty && <i className="ps-dot" title="Unsaved changes" />}
          </button>))}
      </nav>

      <div className="ps-body">
        {sec === 'pay' && <>
          <Card title="Pay mode" hint="How people are paid by default. You can choose a different mode for one employee in their Pay tab.">
            <div className="pa-modes">
              {([['HOURLY', 'Hourly', 'Paid for the hours worked: hours × hourly rate.'], ['MONTHLY', 'Monthly', 'A fixed monthly salary; missing days reduce it by loss of pay.']] as const).map(([k, t, d]) => (
                <button key={k} type="button" className={st.defaultMode === k ? 'on' : ''} onClick={() => setSt({ ...st, defaultMode: k })}><IWallet size={26} /><b>{t}</b><small>{d}</small></button>))}
            </div>
          </Card>
          <Card title="Wages & overtime" hint="How a month is divided into days, and how overtime is paid.">
            <div className="pa-grid">
              <div className="pa-num"><label>Monthly pay is divided by</label>
                <select value={pol.workingDaysBasis} onChange={e => P({ workingDaysBasis: e.target.value })}>
                  <option value="SCHEDULED">Working days (month minus weekly offs)</option><option value="CALENDAR">Calendar days in the month</option>
                  <option value="FIXED_26">Fixed 26 days</option><option value="FIXED_30">Fixed 30 days</option></select></div>
              <Num label="Overtime pays" value={st.overtimeMultiplier} min={1} max={5} step={0.05} onChange={v => setSt({ ...st, overtimeMultiplier: v })} unit="× normal rate" />
              <Num label="Overtime starts after" value={pol.otAfterMinutes} max={600} onChange={v => P({ otAfterMinutes: v })} unit="min beyond the day" hint="0 = counts from the first extra minute." />
              <Num label="Daily overtime cap" value={pol.otDailyCapMinutes} max={1440} onChange={v => P({ otDailyCapMinutes: v })} unit="min" hint="0 = no cap." />
            </div>
          </Card>
        </>}

        {sec === 'time' && <Card title="Work time" hint="The standard working day and the company weekly off. Individual employees can have their own weekly off in their Pay tab, or by asking HR from the Leave page.">
          <div className="pa-grid">
            <Num label="Standard hours per day" value={st.standardDailyHours} min={1} max={24} onChange={v => setSt({ ...st, standardDailyHours: v })} unit="hours" />
          </div>
          <label className="pa-lbl">Company weekly off (the default for everyone)</label>
          <div className="lc-quick pa-days">{DAYS.map(([k, l]) => <button key={k} type="button" className={off.includes(k) ? 'on' : ''} onClick={() => setSt({ ...st, weeklyOffDays: off.includes(k) ? off.filter(x => x !== k) : [...off, k] })}>{l}</button>)}</div>
        </Card>}

        {sec === 'lop' && <Card title="Loss of pay" hint="What happens when the daily work time is not achieved. Applies to monthly-salary employees."
          right={<Switch on={pol.lopEnabled} onClick={() => P({ lopEnabled: !pol.lopEnabled })} label={pol.lopEnabled ? 'Rules on' : 'Rules off'} />}>
          <div className={pol.lopEnabled ? '' : 'pa-dim'}>
            <div className="pa-grid">
              <Num label="Grace on the day's hours" value={pol.graceMinutes} max={120} onChange={v => P({ graceMinutes: v })} unit="min" />
              <Num label="Half day needs at least" value={pol.halfDayMinMinutes} min={30} max={720} onChange={v => P({ halfDayMinMinutes: v })} unit="min" />
              <div className="pa-num"><label>Shift starts at</label><div><input type="time" value={pol.shiftStart} onChange={e => P({ shiftStart: e.target.value })} /></div></div>
              <Num label="Late grace" value={pol.lateGraceMinutes} max={120} onChange={v => P({ lateGraceMinutes: v })} unit="min" />
              <Num label="Late arrivals that cost a half day" value={pol.lateCountForHalfDay} max={31} onChange={v => P({ lateCountForHalfDay: v })} unit="lates" hint="0 = lateness never costs pay." />
            </div>
            <ul className="pa-example">
              <li><b>Full day</b>: {hm(Math.max(1, std - pol.graceMinutes))} or more worked. No loss of pay.</li>
              <li><b>Half day</b>: {hm(pol.halfDayMinMinutes)} to just under a full day. Loses 0.5 day of pay.</li>
              <li><b>Less than that, or no punch</b>: loses 1 day of pay.</li>
              <li><b>Late</b>: checking in after {lateAfter}.{pol.lateCountForHalfDay > 0 && <> Every {pol.lateCountForHalfDay} late arrivals in a month loses 0.5 day.</>}</li>
              <li>Approved paid leave, holidays and weekly offs never lose pay. HR can change any day in <b>Payroll, Loss of pay review</b>.</li>
            </ul>
          </div>
        </Card>}

        {sec === 'score' && <Card title="Honour score" hint="Each employee gets a monthly score from 0 to 100. Choose how much each part counts.">
          <div className="pa-weights">
            {([['wAttendance', 'Attendance', 'Days present out of days required'], ['wPunctuality', 'On time', 'Check-ins before the late limit'], ['wHours', 'Full hours', 'Days with the full day worked'], ['wDiscipline', 'Discipline', 'Fewer flagged punches and corrections']] as const).map(([k, l, d]) => (
              <div key={k} className="pa-w"><div><b>{l}</b><small>{d}</small></div>
                <input type="number" min="0" max="100" value={pol[k]} onChange={e => P({ [k]: Number(e.target.value) } as any)} />
                <span>{wsum ? Math.round((pol[k] / wsum) * 100) : 0}%</span></div>))}
          </div>
          <div className="pa-bar">{[['wAttendance', '#3f9a1b'], ['wPunctuality', '#8ad04e'], ['wHours', '#f5c542'], ['wDiscipline', '#f97316']].map(([k, c]) => <i key={k} style={{ width: `${wsum ? ((pol as any)[k] / wsum) * 100 : 0}%`, background: c }} />)}</div>
          <div className="pa-levels"><span className="lv gold">Gold 90+</span><span className="lv silver">Silver 75+</span><span className="lv bronze">Bronze 60+</span><span className="lv imp">Needs improvement</span></div>
          <div className="pa-grid" style={{ marginTop: 14 }}>
            <Num label="Attendance bonus for a score of" value={pol.bonusMinScore} max={100} onChange={v => P({ bonusMinScore: v })} unit="or more" hint="0 = no bonus." />
            <Num label="Bonus amount" value={pol.bonusAmount} step={50} onChange={v => P({ bonusAmount: v })} unit="per month" />
          </div>
        </Card>}

        {sec === 'ded' && <Deductions />}
      </div>
    </div>

    {(dirty || msg || err) && <div className="ap-bar pa-save">
      {err ? <span style={{ color: '#fca5a5' }}>{err}</span> : msg && !dirty ? <span>{msg}</span> : <span><b>Unsaved changes</b></span>}
      {dirty && <><button className="lh-ok" onClick={save}><ICheckCircle size={18} />Save</button><button className="ap-clear" onClick={discard}>Discard</button></>}
      {!dirty && (msg || err) && <button className="ap-clear" onClick={() => { setMsg(''); setErr('') }}>OK</button>}
    </div>}
  </>)
}

function Deductions() {
  const rules = useLoad<any[]>('/api/hr/deductions')
  const blank = { name: '', kind: 'PERCENT', amount: '', wageCap: '', minGross: '', maxGross: '' }
  const [r, setR] = useState(blank)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const n = (v: string) => (v === '' ? null : Number(v))
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/deductions', { name: r.name, kind: r.kind, amount: Number(r.amount), wageCap: n(r.wageCap), minGross: n(r.minGross), maxGross: n(r.maxGross), active: true }); setR(blank); setOpen(false); rules.reload() } catch (e: any) { setErr(e.message) }
  }
  return (
    <Card title="Deductions" hint="Each active rule is taken from gross pay on every payslip. The seeded ones are examples and are off: rates differ by country and year, so check them first."
      right={<button className="lh-add" onClick={() => setOpen(o => !o)}>{open ? 'Close' : '+ Add deduction'}</button>}>
      {open && <form className="lh-form lc-add" onSubmit={add}>
        <div className="grid">
          <div><label>Name</label><input value={r.name} onChange={e => setR({ ...r, name: e.target.value })} required /></div>
          <div><label>Kind</label><select value={r.kind} onChange={e => setR({ ...r, kind: e.target.value })}><option value="PERCENT">Percent of gross</option><option value="FIXED">Fixed amount</option></select></div>
          <div><label>{r.kind === 'PERCENT' ? 'Percent' : 'Amount'}</label><input type="number" step="0.01" min="0" value={r.amount} onChange={e => setR({ ...r, amount: e.target.value })} required /></div>
          <div><label>Wage cap (optional)</label><input type="number" min="0" value={r.wageCap} onChange={e => setR({ ...r, wageCap: e.target.value })} /></div>
          <div><label>Only if gross at least</label><input type="number" min="0" value={r.minGross} onChange={e => setR({ ...r, minGross: e.target.value })} /></div>
          <div><label>Only if gross at most</label><input type="number" min="0" value={r.maxGross} onChange={e => setR({ ...r, maxGross: e.target.value })} /></div>
        </div>{err && <div className="err">{err}</div>}<p style={{ marginBottom: 0 }}><button className="btn">Add deduction</button></p></form>}
      <div className="lh-types">
        {rules.data?.map(x => (
          <div key={x.id} className={`lh-type${x.active ? '' : ' off'}`}>
            <b>{x.name}</b>
            <div className="pa-rule"><span className="lh-chip">{x.kind === 'PERCENT' ? `${Number(x.amount)}%` : `${Number(x.amount)} flat`}</span>
              {x.wageCap != null && <span className="lh-chip">cap {x.wageCap}</span>}{x.minGross != null && <span className="lh-chip">from {x.minGross}</span>}{x.maxGross != null && <span className="lh-chip">up to {x.maxGross}</span>}</div>
            <div className="lh-toggles"><Switch on={x.active} label={x.active ? 'On' : 'Off'} onClick={async () => { await put(`/api/hr/deductions/${x.id}`, { ...x, active: !x.active }); rules.reload() }} />
              <button className="lc-del" onClick={async () => { if (confirm(`Delete ${x.name}?`)) { await del(`/api/hr/deductions/${x.id}`); rules.reload() } }}>Delete</button></div>
          </div>))}
      </div>
    </Card>
  )
}

/* ============ Payroll ============ */

export function Payroll() {
  const { data, reload } = useLoad<any[]>('/api/hr/payroll/runs')
  const [period, setPeriod] = useState(today().slice(0, 7))
  const [mode, setMode] = useState('HOURLY')
  useEffect(() => { get('/api/hr/settings').then(s => setMode(s.defaultMode)).catch(() => {}) }, [])
  const [err, setErr] = useState('')
  const [run, setRun] = useState<number | null>(null)
  const [prev, setPrev] = useState<any[] | null>(null)
  const slips = useLoad<any[]>(run ? `/api/hr/payroll/runs/${run}/payslips` : '/api/hr/payroll/runs', [run])
  async function preview() {
    setErr('')
    try { setPrev(await post('/api/hr/payroll/preview', { period, mode })); setRun(null) } catch (e: any) { setErr(e.message) }
  }
  async function gen() {
    setErr('')
    try { const r = await post('/api/hr/payroll/generate', { period, mode }); setRun(r.runId); setPrev(null); reload() } catch (e: any) { setErr(e.message) }
  }
  const adjust = async (id: number) => {
    const v = prompt('Adjustment amount (negative for a deduction)')
    if (v === null || isNaN(Number(v))) return
    await post(`/api/hr/payroll/payslips/${id}/adjust`, { amount: Number(v) }); slips.reload()
  }
  const rows: any[] | null = run && slips.data ? (slips.data as any[]) : prev
  const total = (k: string) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0)
  return (<>
    <div className="lh-stats">
      <div className="lh-stat g"><span><IWallet size={26} /></span><b>{rows ? money(total('net')) : '—'}</b><small>{prev ? 'Net pay (preview)' : run ? 'Net pay (generated)' : 'Net pay'}</small></div>
      <div className="lh-stat y"><span><IUsers size={26} /></span><b>{rows?.length ?? '—'}</b><small>Employees</small></div>
    </div>
    <Card title="Generate payroll" hint="Pay comes from approved attendance hours, plus a standard day for each paid holiday and paid leave day. Resolve “To approve” and “Leave” first. Check the preview, then generate.">
      <form className="pa-gen" onSubmit={e => { e.preventDefault(); preview() }}>
        <input type="month" value={period} onChange={e => { setPeriod(e.target.value); setPrev(null) }} />
        <select value={mode} onChange={e => { setMode(e.target.value); setPrev(null) }}><option value="HOURLY">Hourly (default)</option><option value="MONTHLY">Monthly (default)</option></select>
        <button className="lh-add">Preview</button>
        <button type="button" className="btn" onClick={gen} disabled={!prev}>Generate</button>
      </form>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>The mode is used for employees with no pay mode of their own. Generate is available after you preview.</p>
      {err && <div className="err">{err}</div>}
    </Card>

    {rows && <Card title={prev ? `Preview for ${period}` : 'Payslips'} hint={prev ? 'Nothing is saved yet. Generate to create the payslips.' : undefined}>
      <div className="scroll"><table className="pa-table">
        <thead><tr><th>Employee</th><th>Hours</th><th>OT</th><th>Allow.</th><th>Loss of pay</th><th>Bonus</th><th>Gross</th><th>Deduct.</th>{!prev && <th>Adjust</th>}<th>Net</th><th>Score</th></tr></thead>
        <tbody>{rows.map(p => (
          <tr key={p.id ?? p.employeeId}>
            <td><b>{p.employeeName}</b><div className="muted">{(p.payMode ?? p.mode ?? '').toLowerCase()}</div></td>
            <td>{p.regularHours} h{Number(p.creditHours) > 0 && <div className="muted">+{p.creditHours} h leave/holiday</div>}</td>
            <td>{p.overtimeHours} h</td>
            <td>{money(p.allowances)}</td>
            <td>{Number(p.lopDays) > 0 ? <span className="pa-lop">{Number(p.lopDays)} d<div>−{money(p.lopAmount)}</div></span> : '—'}</td>
            <td>{Number(p.bonus) > 0 ? money(p.bonus) : '—'}</td>
            <td>{money(p.gross)}</td>
            <td title={p.deductionDetail ?? ''}>{money(p.deductions)}</td>
            {!prev && <td>{money(p.adjustments)} <button className="at-fix" onClick={() => adjust(p.id)} aria-label="Adjust">±</button></td>}
            <td><b>{money(p.net)}</b></td>
            <td>{p.score != null ? <span className={`pa-sc ${levelOf(p.score)}`}>{p.score}</span> : '—'}</td>
          </tr>))}</tbody>
      </table></div>
    </Card>}

    <Card title="Past runs">
      {data?.length === 0 && <p className="muted" style={{ margin: 0 }}>No payroll generated yet.</p>}
      <div className="lh-types">
        {data?.map(r => (
          <div key={r.id} className={`lh-type${run === r.id ? ' lc-sel' : ''}`}><b>{r.period}</b>
            <small className="muted">{r.mode.toLowerCase()} · {fmtDateTime(r.createdAt)}</small>
            <button className="lh-add" onClick={() => { setRun(r.id); setPrev(null) }}>View payslips</button></div>))}
      </div>
    </Card>
  </>)
}

const levelOf = (s: number) => (s >= 90 ? 'gold' : s >= 75 ? 'silver' : s >= 60 ? 'bronze' : 'imp')

/* ============ Loss of pay review ============ */

const STATUS: Record<string, string> = { FULL: 'Full day', HALF: 'Half day', SHORT: 'Too short', ABSENT: 'Absent', LEAVE: 'Paid leave', UNPAID_LEAVE: 'Unpaid leave', HOLIDAY: 'Holiday', HOLIDAY_UNPAID: 'Unpaid holiday', OFF: 'Weekly off' }

export function LopReview() {
  const emps = useLoad<any[]>('/api/hr/employees').data
  const [emp, setEmp] = useState('')
  const [month, setMonth] = useState(today().slice(0, 7))
  const pol = useLoad<Pol>('/api/hr/policy').data
  const { data, reload } = useLoad<any>(emp ? `/api/hr/attendance/day-status?employeeId=${emp}&month=${month}` : '/api/hr/policy', [emp, month])
  const [edit, setEdit] = useState<null | { date: string; lop: number; reason: string }>(null)
  const [err, setErr] = useState('')
  const days: any[] = emp && data?.days ? data.days : []
  async function saveOv(clear = false) {
    if (!edit) return
    setErr('')
    try { await put('/api/hr/attendance/lop-override', { employeeId: Number(emp), date: edit.date, lopDays: clear ? null : edit.lop, reason: edit.reason }); setEdit(null); reload() } catch (e: any) { setErr(e.message) }
  }
  return (<>
    {pol && !pol.lopEnabled && <div className="lc-state"><IAlert size={20} /><span><b>Loss of pay rules are off.</b> This page shows what they would do; payroll ignores it until you turn the rules on in Settings.</span></div>}
    <Card title="Loss of pay review" hint="Day by day, what each employee's attendance means for pay. Change a day if there is a good reason, and it is recorded.">
      <div className="pa-gen"><select value={emp} onChange={e => setEmp(e.target.value)}><option value="">Choose an employee…</option>{emps?.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
      {emp && data?.days && <div className="lh-stats" style={{ marginTop: 14, marginBottom: 6 }}>
        <div className="lh-stat y"><span><IClock size={26} /></span><b>{Number(data.lopDays)}</b><small>Loss of pay days{Number(data.lateLop) > 0 && ` (${data.lateLop} from ${data.lateDays} late arrivals)`}</small></div>
        <div className="lh-stat g"><span><ICal size={26} /></span><b>{days.filter(d => ['FULL', 'HALF', 'SHORT'].includes(d.status)).length}</b><small>Days worked</small></div>
      </div>}
      {!emp && <div className="lh-empty"><IUsers size={34} /><b>Pick an employee</b><small>Their month will show here.</small></div>}
      {err && <div className="err">{err}</div>}
      <div className="at-list" style={{ marginTop: 10 }}>
        {days.filter(d => d.status !== 'OFF').map(d => (
          <div key={d.date} className={`at-row pa-day ${d.status === 'FULL' || d.status.startsWith('HOLIDAY') && d.status === 'HOLIDAY' || d.status === 'LEAVE' ? 'present' : d.status === 'HALF' ? 'leave' : 'absent'}`}>
            <span className="lh-hd" style={{ width: 44, height: 44 }}><b>{new Date(d.date + 'T00:00').getDate()}</b>{new Date(d.date + 'T00:00').toLocaleDateString([], { weekday: 'short' })}</span>
            <div className="at-who"><b>{STATUS[d.status] ?? d.status}</b><small>{d.workedMinutes > 0 ? `${hm(d.workedMinutes)} worked` : 'No hours'}{d.lateMinutes > 0 && ` · ${d.lateMinutes} min late`}{d.shortMinutes > 0 && d.workedMinutes > 0 && ` · ${d.shortMinutes} min short`}</small></div>
            <div className="at-times" style={{ gridColumn: 'auto' }}>{d.overridden && <span className="lh-chip warn" title={d.reason ?? ''}>changed by HR{d.reason ? `: ${d.reason}` : ''}</span>}</div>
            <div className="at-hours"><b>{Number(d.lop) > 0 ? `−${d.lop} day` : 'No loss'}</b></div>
            <span />
            <button className="at-fix" onClick={() => setEdit({ date: d.date, lop: Number(d.lop), reason: d.reason ?? '' })} aria-label="Change this day">✎</button>
          </div>))}
      </div>
    </Card>
    {edit && <div className="overlay center" onMouseDown={e => { if (e.target === e.currentTarget) setEdit(null) }}>
      <div className="modal small"><h2>Change {new Date(edit.date + 'T00:00').toLocaleDateString([], { day: 'numeric', month: 'short' })}</h2>
        <label>Loss of pay for this day</label>
        <div className="pm-seg" style={{ display: 'flex', gap: 8 }}>{[0, 0.5, 1].map(v => <button key={v} type="button" className={`lc-q${edit.lop === v ? ' on' : ''}`} onClick={() => setEdit({ ...edit, lop: v })}>{v === 0 ? 'None' : v === 0.5 ? 'Half day' : 'Full day'}</button>)}</div>
        <label>Reason (required)</label><input value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} placeholder="e.g. System was down, approved by manager" />
        {err && <div className="err">{err}</div>}
        <div className="actions"><button className="btn" onClick={() => saveOv()}>Save</button><button className="btn ghost" onClick={() => saveOv(true)}>Use the automatic result</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
      </div></div>}
  </>)
}

/* ============ Honour scores ============ */

const LEVEL: Record<string, string> = { GOLD: 'Gold', SILVER: 'Silver', BRONZE: 'Bronze', IMPROVE: 'Needs improvement', NO_DATA: 'No data yet' }

export function Scores() {
  const [month, setMonth] = useState(today().slice(0, 7))
  const { data } = useLoad<any[]>(`/api/hr/scores?month=${month}`, [month])
  const [open, setOpen] = useState<number | null>(null)
  const rows = [...(data ?? [])].sort((a, b) => (b.score.score ?? -1) - (a.score.score ?? -1))
  const scored = rows.filter(r => r.score.score != null)
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score.score, 0) / scored.length) : null
  return (<>
    <div className="at-bar"><div className="at-date"><label><ICal size={18} /><b>{new Date(month + '-01T00:00').toLocaleDateString([], { month: 'long', year: 'numeric' })}</b><input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label></div></div>
    <div className="lh-stats">
      <div className="lh-stat g"><span><ICheckCircle size={26} /></span><b>{avg ?? '—'}</b><small>Average score</small></div>
      <div className="lh-stat y"><span><IUsers size={26} /></span><b>{scored.filter(r => r.score.score >= 90).length}</b><small>Gold (90+)</small></div>
    </div>
    <Card title="Honour scores" hint="Each month's score out of 100. Approved leave, holidays and weekly offs are not counted against anyone. Tap a person for the breakdown.">
      {data && rows.length === 0 && <div className="lh-empty"><IUsers size={34} /><b>No employees</b></div>}
      <div className="lh-reqs">
        {rows.map((r, i) => { const s = r.score; return (
          <div key={r.employeeId} className="pa-score" onClick={() => setOpen(open === r.employeeId ? null : r.employeeId)}>
            <span className="pa-rank">{s.score != null ? i + 1 : ''}</span>
            <span className="lh-av">{initials(r.employeeName)}</span>
            <div className="at-who"><b>{r.employeeName}</b><small>{r.employeeCode}</small></div>
            <span className={`pa-lv ${s.level.toLowerCase()}`}>{LEVEL[s.level]}</span>
            <span className={`pa-ring ${s.score != null ? levelOf(s.score) : 'imp'}`} style={{ ['--p' as any]: `${s.score ?? 0}%` }}><b>{s.score ?? '—'}</b></span>
            {open === r.employeeId && <div className="pa-break">
              {[['Attendance', s.attendancePct, `${s.fullDays} full + ${s.halfDays} half of ${s.requiredDays} days`], ['On time', s.punctualityPct, `${s.lateDays} late arrivals`], ['Full hours', s.hoursPct, ''], ['Discipline', s.disciplinePct, `${s.flaggedPunches} flagged punches, ${s.corrections} corrections`]].map(([l, v, d]) => (
                <div key={l as string}><span>{l as string}<small>{d as string}</small></span><div className="pa-meter"><i style={{ width: `${v}%` }} /></div><b>{v as number}%</b></div>))}
            </div>}
          </div>) })}
      </div>
    </Card>
  </>)
}

