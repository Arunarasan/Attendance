import { FormEvent, useEffect, useState } from 'react'
import { get, post, today } from '../lib/api'
import { IAlert, ICal, ICheckCircle, IClock, ISend, IX } from '../components/icons'

const DAYS: [string, string][] = [['MONDAY', 'Mon'], ['TUESDAY', 'Tue'], ['WEDNESDAY', 'Wed'], ['THURSDAY', 'Thu'], ['FRIDAY', 'Fri'], ['SATURDAY', 'Sat'], ['SUNDAY', 'Sun']]
const full = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()
const abbr = (csv: string) => csv.split(',').map(x => DAYS.find(([k]) => k.startsWith(x.trim().toUpperCase().slice(0, 3)))?.[0] ?? x)
const nice = (d: string) => new Date(d + 'T00:00').toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
const addDays = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const REASONS = ['Family commitment', 'Religious or personal reason', 'Study or health', 'Travel or distance']
const SRC: Record<string, string> = { COMPANY: 'Company default', HR: 'Set by HR', REQUEST: 'Approved by HR' }

/** Employee: your weekly off, shown on the Leave page, with a way to ask HR to change it. A request only counts once HR approves it. */
export default function WeeklyOffSection() {
  const [data, setData] = useState<any>(null)
  const [pick, setPick] = useState<string[]>([])
  const [from, setFrom] = useState(addDays(1))
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const load = () => get('/api/me/off-days').then(setData).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  if (!data) return <p className="pm-muted">{err || 'Loading…'}</p>
  const cur = data.current
  const max: number = data.maxDays
  const pending = (data.requests as any[]).find(r => r.status === 'PENDING')
  const toggle = (k: string) => setPick(p => (p.includes(k) ? p.filter(x => x !== k) : p.length >= max ? [...p.slice(1), k] : [...p, k]))

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk(''); setBusy(true)
    try { await post('/api/me/off-days/request', { days: pick, effectiveFrom: from, reason }); setOk('Request sent to HR'); setPick([]); setReason(''); setOpen(false); load() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const cancel = async (id: number) => { setErr(''); try { await post(`/api/me/off-days/requests/${id}/cancel`); load() } catch (e: any) { setErr(e.message) } }

  return (<>
    <section className="pm-card wo-card">
      <div className="wo-top">
        <span className="wo-ic"><ICal size={22} /></span>
        <div className="wo-t"><small>Your weekly off</small><b>{(cur.days as string[]).map(full).join(' & ')}</b><small>{SRC[cur.source] ?? cur.source}{cur.validFrom && ` · since ${nice(cur.validFrom)}`}</small></div>
        {!pending && <button type="button" className="wo-change" onClick={() => { setOpen(o => !o); setErr(''); setOk('') }}>{open ? 'Close' : 'Change'}</button>}
      </div>
      <div className="wo-week">{DAYS.map(([k, l]) => <i key={k} className={(cur.days as string[]).includes(k) ? 'off' : ''}>{l}</i>)}</div>
    </section>
    {ok && !open && <div className="msg">{ok}</div>}
    {cur.upcomingDays && <div className="wo-note ok"><ICheckCircle size={20} /><span>From <b>{nice(cur.upcomingFrom)}</b> your weekly off becomes <b>{(cur.upcomingDays as string[]).map(full).join(' & ')}</b>.</span></div>}

    {pending && <section className="pm-card wo-wait">
      <span className="lv-st wait"><IClock size={22} /></span>
      <div className="lv-req-m"><b>Waiting for HR</b>
        <small>You asked for {abbr(pending.offDays).map(full).join(' & ')} from {nice(pending.effectiveFrom)}</small>
        <small>Your weekly off stays {(cur.days as string[]).map(full).join(' & ')} until HR approves.</small></div>
      <button className="lv-wd" onClick={() => cancel(pending.id)}>Withdraw</button>
    </section>}

    {!pending && open && <form onSubmit={submit}>
      <div className="pm-h"><h3>Ask for a different weekly off</h3></div>
      <div className="wo-note"><IAlert size={20} /><span>HR must approve this. <b>Only if HR approves</b> is the new day given to you; otherwise nothing changes. You can change it once every {data.cooldownDays} days.</span></div>

      <div className="pm-h"><h3>Choose {max === 1 ? 'a day' : `up to ${max} days`}</h3></div>
      <div className="wo-days">{DAYS.map(([k, l]) => <button key={k} type="button" className={pick.includes(k) ? 'on' : ''} onClick={() => toggle(k)}>{l}</button>)}</div>

      <div className="pm-h"><h3>Starting from</h3></div>
      <label className="lv-date"><span className="lv-date-ic"><ICal size={22} /></span><span className="lv-date-l">Start date</span><b>{nice(from)}</b>
        <small>{new Date(from + 'T00:00').toLocaleDateString([], { weekday: 'long' })}</small>
        <input type="date" value={from} min={today()} max={addDays(60)} onChange={e => e.target.value && setFrom(e.target.value)} required /></label>

      <div className="pm-h"><h3>Why?</h3></div>
      <div className="lv-chips">{REASONS.map(r => <button key={r} type="button" className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>{r}</button>)}</div>
      <textarea className="lv-reason" rows={3} placeholder="Tell HR why you need this day" value={reason} onChange={e => setReason(e.target.value)} required />

      {err && <div className="err">{err}</div>}{ok && <div className="msg">{ok}</div>}
      <button className="lv-submit" disabled={busy || pick.length === 0 || !reason.trim()}><ISend size={20} />{busy ? 'Sending…' : 'Send to HR'}</button>
    </form>}
    {pending && err && <div className="err">{err}</div>}

    {(data.requests as any[]).length > 0 && <>
      <div className="pm-h"><h3>Weekly off requests</h3></div>
      {(data.requests as any[]).slice(0, 3).map(r => {
        const st = r.status === 'APPROVED' ? 'ok' : r.status === 'PENDING' ? 'wait' : 'no'
        return (
          <section key={r.id} className="pm-card lv-req">
            <span className={`lv-st ${st}`}>{st === 'ok' ? <ICheckCircle size={22} /> : st === 'wait' ? <IClock size={22} /> : <IX size={22} />}</span>
            <div className="lv-req-m"><b>{abbr(r.offDays).map(full).join(' & ')}</b>
              <small>From {nice(r.effectiveFrom)} · {r.status === 'APPROVED' ? 'approved: this day was given' : r.status === 'REJECTED' ? 'not approved' : r.status.toLowerCase()}</small>
              {r.decisionNote && <small>HR: {r.decisionNote}</small>}</div>
          </section>)
      })}
    </>}
  </>)
}
