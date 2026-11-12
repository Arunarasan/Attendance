import { useEffect, useState } from 'react'
import { get, put, today } from '../../lib/api'

const DAYS: [string, string][] = [['MONDAY', 'Mon'], ['TUESDAY', 'Tue'], ['WEDNESDAY', 'Wed'], ['THURSDAY', 'Thu'], ['FRIDAY', 'Fri'], ['SATURDAY', 'Sat'], ['SUNDAY', 'Sun']]
const full = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()
const SRC: Record<string, string> = { COMPANY: 'company default', HR: 'set by HR', REQUEST: 'approved request' }

/** HR gives one employee their own weekly off, or puts them back on the company default. */
export default function EmpOffDays({ empId, toast }: { empId: number; toast: (t: string, bad?: boolean) => void }) {
  const [info, setInfo] = useState<any>(null)
  const [pick, setPick] = useState<string[]>([])
  const [from, setFrom] = useState(today())
  const [busy, setBusy] = useState(false)
  const load = () => get(`/api/hr/employees/${empId}/off-days`).then(x => { setInfo(x); setPick(x.current.days) }).catch(() => setInfo(null))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [empId])
  if (!info) return null
  const cur = info.current
  const same = JSON.stringify([...pick].sort()) === JSON.stringify([...cur.days].sort())
  const toggle = (k: string) => setPick(p => (p.includes(k) ? p.filter(x => x !== k) : p.length >= 2 ? [...p.slice(1), k] : [...p, k]))
  async function save(days: string[] | null) {
    setBusy(true)
    try { await put(`/api/hr/employees/${empId}/off-days`, { days, validFrom: from }); toast(days ? 'Weekly off saved' : 'Back on the company weekly off'); await load() } catch (e: any) { toast(e.message, true) } finally { setBusy(false) }
  }
  return (
    <div className="full" style={{ marginTop: 14 }}>
      <div className="fieldset-title">Weekly off</div>
      <p className="hint" style={{ marginTop: 4 }}>Now: <b>{(cur.days as string[]).map(full).join(' & ')}</b> ({SRC[cur.source] ?? cur.source}).
        {cur.upcomingDays && <> From {cur.upcomingFrom}: <b>{(cur.upcomingDays as string[]).map(full).join(' & ')}</b>.</>}</p>
      <div className="chips" style={{ margin: '8px 0' }}>{DAYS.map(([k, l]) => <button key={k} type="button" className={`chip${pick.includes(k) ? ' on' : ''}`} onClick={() => toggle(k)}>{l}</button>)}</div>
      <label htmlFor="empoffda-f1">Starts on</label>
      <input id="empoffda-f1" type="date" value={from} min={today()} onChange={e => e.target.value && setFrom(e.target.value)} />
      <div className="hint">Choose one or two days. Changes only apply from the start date, so past pay is never recalculated.</div>
      <p className="row">
        <button type="button" className="btn" disabled={busy || pick.length === 0 || same} onClick={() => save(pick)}>Save weekly off</button>
        {!cur.companyDefault && <button type="button" className="btn ghost" disabled={busy} onClick={() => save(null)}>Use company default</button>}
      </p>
    </div>
  )
}
