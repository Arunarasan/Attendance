import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { del, get, post, put, today } from '../lib/api'
import { IArrowR, IBriefcase, ICal, ICalPlus, ICheckCircle, IClock, IHeart, ISun, IUmbrella, IX } from '../components/icons'
import './leaveHolidays.css'

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path])
  return { data, err, reload }
}

const leaveIcon = (name: string, size = 24) => {
  const n = (name ?? '').toLowerCase()
  return n.includes('sick') || n.includes('medic') ? <IHeart size={size} /> : n.includes('casual') ? <IUmbrella size={size} />
    : n.includes('earn') || n.includes('annual') || n.includes('privilege') ? <ISun size={size} /> : <IBriefcase size={size} />
}
const initials = (name: string) => (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
const dateOf = (d: string) => new Date(d + 'T00:00')
const nice = (d: string) => dateOf(d).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
const num = (v: any) => Number(v).toString()

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>{action}</div>
      {children}
    </section>
  )
}

/* ---------------- Leave ---------------- */

function TypeCard({ x, onSaved }: { x: any; onSaved: () => void }) {
  const [name, setName] = useState<string>(x.name)
  const [quota, setQuota] = useState<number>(Number(x.annualQuota))
  const [err, setErr] = useState('')
  const dirty = name.trim() !== x.name || quota !== Number(x.annualQuota)
  const step = (d: number) => setQuota(q => Math.max(0, Math.round((q + d) * 2) / 2))
  const save = async () => {
    setErr('')
    if (!name.trim()) { setErr('Enter a name'); return }
    try { await put(`/api/hr/leave/types/${x.id}`, { name: name.trim(), annualQuota: quota }); onSaved() } catch (e: any) { setErr(e.message) }
  }
  const flip = async (body: object) => { await put(`/api/hr/leave/types/${x.id}`, body); onSaved() }
  return (
    <div className={`lh-type${x.active ? '' : ' off'}`}>
      <div className="lh-type-top">
        <span className="lh-ic">{leaveIcon(x.name)}</span>
        <div className="lh-type-name"><input value={name} onChange={e => setName(e.target.value)} aria-label="Leave name" /><small>{x.code}</small></div>
      </div>
      <div className="lh-quota">
        <button type="button" onClick={() => step(-0.5)} aria-label="Less">−</button>
        <div><input type="number" min="0" step="0.5" value={quota} onChange={e => setQuota(Math.max(0, Number(e.target.value)))} aria-label="Days per year" /><small>{quota === 0 ? 'no limit' : 'days / year'}</small></div>
        <button type="button" onClick={() => step(0.5)} aria-label="More">+</button>
      </div>
      <div className="lh-toggles">
        <button type="button" className={`lh-tg${x.paid ? ' on' : ''}`} onClick={() => flip({ paid: !x.paid })}><i />{x.paid ? 'Paid' : 'Unpaid'}</button>
        <button type="button" className={`lh-tg${x.active ? ' on' : ''}`} onClick={() => flip({ active: !x.active })}><i />{x.active ? 'Active' : 'Off'}</button>
      </div>
      {err && <div className="err">{err}</div>}
      {dirty && <button className="lh-save" onClick={save}>Save changes</button>}
    </div>
  )
}

function AddType({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState({ code: '', name: '', paid: true, annualQuota: '0' })
  const [err, setErr] = useState('')
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/leave/types', { ...t, annualQuota: Number(t.annualQuota) }); setT({ code: '', name: '', paid: true, annualQuota: '0' }); onDone() } catch (e: any) { setErr(e.message) }
  }
  return (
    <form className="lh-form" onSubmit={add}>
      <div className="grid">
        <div><label>Code</label><input value={t.code} maxLength={12} onChange={e => setT({ ...t, code: e.target.value })} required placeholder="e.g. ML" /></div>
        <div><label>Name</label><input value={t.name} onChange={e => setT({ ...t, name: e.target.value })} required placeholder="e.g. Maternity leave" /></div>
        <div><label>Pay</label><select value={t.paid ? 'paid' : 'unpaid'} onChange={e => setT({ ...t, paid: e.target.value === 'paid' })}><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></div>
        <div><label>Days per year (0 = no limit)</label><input type="number" min="0" step="0.5" value={t.annualQuota} onChange={e => setT({ ...t, annualQuota: e.target.value })} /></div>
      </div>
      {err && <div className="err">{err}</div>}
      <p><button className="btn">Add leave type</button></p>
    </form>
  )
}

function RecordLeave({ emps, types }: { emps: any[]; types: any[] }) {
  const [f, setF] = useState({ employeeId: '', leaveTypeId: '', startDate: today(), endDate: today(), halfDay: false, reason: '' })
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  async function apply(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk('')
    try { await post('/api/hr/leave/requests', { ...f, employeeId: Number(f.employeeId), leaveTypeId: Number(f.leaveTypeId), halfDay: f.halfDay && f.startDate === f.endDate }); setOk('Recorded and approved') } catch (e: any) { setErr(e.message) }
  }
  return (
    <form className="lh-form" onSubmit={apply}>
      <div className="grid">
        <div><label>Employee</label><select value={f.employeeId} onChange={e => setF({ ...f, employeeId: e.target.value })} required><option value="">Choose…</option>{emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div><label>Type</label><select value={f.leaveTypeId} onChange={e => setF({ ...f, leaveTypeId: e.target.value })} required><option value="">Choose…</option>{types.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><label>From</label><input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} required /></div>
        <div><label>To</label><input type="date" value={f.endDate} min={f.startDate} onChange={e => setF({ ...f, endDate: e.target.value })} required /></div>
      </div>
      {f.startDate === f.endDate && <label className="lh-check"><input type="checkbox" checked={f.halfDay} onChange={e => setF({ ...f, halfDay: e.target.checked })} /> Half day</label>}
      <label>Reason</label><input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="For example: called in sick" />
      {err && <div className="err">{err}</div>}{ok && <div className="msg">{ok}</div>}
      <p><button className="btn">Record leave</button></p>
    </form>
  )
}

export function LeaveAdmin() {
  const reqs = useLoad<any[]>('/api/hr/leave/requests?status=PENDING')
  const types = useLoad<any[]>('/api/hr/leave/types')
  const emps = useLoad<any[]>('/api/hr/employees').data
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<null | 'type' | 'record'>(null)
  const act = async (id: number, a: 'approve' | 'reject') => { setErr(''); try { await post(`/api/hr/leave/requests/${id}/${a}`); reqs.reload() } catch (e: any) { setErr(e.message) } }
  const waiting = reqs.data?.length ?? 0
  const active = types.data?.filter(x => x.active).length ?? 0
  return (<>
    <div className="lh-stats">
      <div className="lh-stat y"><span><IClock size={26} /></span><b>{waiting}</b><small>Waiting for approval</small></div>
      <div className="lh-stat g"><span><ICal size={26} /></span><b>{active}</b><small>Active leave types</small></div>
    </div>

    <Section title="Leave requests" hint="Approve or reject what your team has asked for.">
      {err && <div className="err">{err}</div>}
      {waiting === 0 && <div className="lh-empty"><ICheckCircle size={34} /><b>All caught up</b><small>No leave requests are waiting.</small></div>}
      <div className="lh-reqs">
        {reqs.data?.map(r => (
          <div key={r.id} className="lh-req">
            <span className="lh-av">{initials(r.employeeName)}</span>
            <div className="lh-req-m">
              <b>{r.employeeName}</b><small>{r.employeeCode}</small>
              <div className="lh-req-chips">
                <span className="lh-chip">{leaveIcon(r.leaveName, 14)}{r.leaveName}</span>
                <span className={`lh-chip ${r.paid ? 'ok' : 'warn'}`}>{r.paid ? 'Paid' : 'Unpaid'}</span>
                <span className="lh-chip">{num(r.days)} {Number(r.days) === 1 ? 'day' : 'days'}</span>
              </div>
              <div className="lh-req-d"><ICal size={16} />{nice(r.startDate)}{r.endDate !== r.startDate && <> <IArrowR size={14} /> {nice(r.endDate)}</>}{r.halfDay && ' (half day)'}</div>
              {r.reason && <q>{r.reason}</q>}
            </div>
            <div className="lh-req-a">
              <button className="lh-ok" onClick={() => act(r.id, 'approve')}><ICheckCircle size={18} />Approve</button>
              <button className="lh-no" onClick={() => act(r.id, 'reject')}><IX size={18} />Reject</button>
            </div>
          </div>))}
      </div>
    </Section>

    <Section title="Leave types & yearly limits" hint="Employees see these limits, and how much is left, on their Leave page. 0 days means no limit."
      action={<button className="lh-add" onClick={() => setOpen(open === 'type' ? null : 'type')}>{open === 'type' ? 'Close' : '+ Add leave type'}</button>}>
      {open === 'type' && <AddType onDone={() => { types.reload(); setOpen(null) }} />}
      <div className="lh-types">{types.data?.map(x => <TypeCard key={`${x.id}-${x.name}-${x.annualQuota}`} x={x} onSaved={types.reload} />)}</div>
    </Section>

    <Section title="Record leave for someone" hint="For example, a phone call in sick. It is approved straight away and counts toward their balance."
      action={<button className="lh-add" onClick={() => setOpen(open === 'record' ? null : 'record')}>{open === 'record' ? 'Close' : <><ICalPlus size={16} /> Record leave</>}</button>}>
      {open === 'record' && <RecordLeave emps={emps ?? []} types={types.data ?? []} />}
    </Section>
  </>)
}

/* ---------------- Holidays ---------------- */

export function Holidays() {
  const [year, setYear] = useState(new Date().getFullYear())
  const { data, reload } = useLoad<any[]>(`/api/hr/holidays?year=${year}`)
  const [f, setF] = useState({ date: '', name: '', paid: true })
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/holidays', f); setF({ date: '', name: '', paid: true }); setOpen(false); reload() } catch (e: any) { setErr(e.message) }
  }
  const list = [...(data ?? [])].sort((a, b) => String(a.holidayDate).localeCompare(String(b.holidayDate)))
  const next = list.find(h => h.holidayDate >= today())
  const groups = list.reduce<Record<string, any[]>>((m, h) => { const k = dateOf(h.holidayDate).toLocaleDateString([], { month: 'long' }); (m[k] ||= []).push(h); return m }, {})
  const paid = list.filter(h => h.paid).length
  return (<>
    <div className="lh-year">
      <button onClick={() => setYear(y => y - 1)} aria-label="Previous year">‹</button><b>{year}</b><button onClick={() => setYear(y => y + 1)} aria-label="Next year">›</button>
      <button className="lh-add" style={{ marginLeft: 'auto' }} onClick={() => setOpen(o => !o)}>{open ? 'Close' : '+ Add holiday'}</button>
    </div>

    {open && <form className="lh-form lh-card" onSubmit={add}>
      <div className="grid">
        <div><label>Date</label><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></div>
        <div><label>Name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="e.g. Diwali" /></div>
        <div><label>Pay</label><select value={f.paid ? 'paid' : 'unpaid'} onChange={e => setF({ ...f, paid: e.target.value === 'paid' })}><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></div>
      </div>
      {err && <div className="err">{err}</div>}
      <p><button className="btn">Add holiday</button></p>
    </form>}

    <div className="lh-stats">
      <div className="lh-stat g"><span><ICal size={26} /></span><b>{list.length}</b><small>Holidays in {year}</small></div>
      <div className="lh-stat y"><span><IUmbrella size={26} /></span><b>{paid}</b><small>Paid holidays</small></div>
    </div>

    {next && year === new Date().getFullYear() && (
      <div className="lh-next"><span className="lh-hd big"><b>{dateOf(next.holidayDate).getDate()}</b>{dateOf(next.holidayDate).toLocaleDateString([], { month: 'short' })}</span>
        <div><small>Next holiday</small><b>{next.name}</b><small>{dateOf(next.holidayDate).toLocaleDateString([], { weekday: 'long' })} · {next.paid ? 'Paid' : 'Unpaid'}</small></div></div>
    )}

    {list.length === 0 && <div className="lh-empty"><ICal size={34} /><b>No holidays for {year}</b><small>Use “+ Add holiday” to add the first one.</small></div>}
    {Object.entries(groups).map(([month, hs]) => (
      <Section key={month} title={month}>
        <div className="lh-hols">
          {hs.map(h => (
            <div key={h.id} className="lh-hol">
              <span className="lh-hd"><b>{dateOf(h.holidayDate).getDate()}</b>{dateOf(h.holidayDate).toLocaleDateString([], { weekday: 'short' })}</span>
              <div className="lh-hol-m"><b>{h.name}</b><small>{nice(h.holidayDate)}</small></div>
              <button className={`lh-tg${h.paid ? ' on' : ''}`} onClick={async () => { await put(`/api/hr/holidays/${h.id}`, { paid: !h.paid }); reload() }}><i />{h.paid ? 'Paid' : 'Unpaid'}</button>
              <button className="lh-del" aria-label={`Delete ${h.name}`} onClick={async () => { if (confirm(`Delete ${h.name}?`)) { await del(`/api/hr/holidays/${h.id}`); reload() } }}><IX size={18} /></button>
            </div>))}
        </div>
      </Section>))}
    <p className="muted" style={{ fontSize: 13 }}>A paid holiday on a normal working day pays everyone a standard day, whether or not they came in. An unpaid holiday is a day off with no pay. Holidays are not counted as leave days.</p>
  </>)
}
