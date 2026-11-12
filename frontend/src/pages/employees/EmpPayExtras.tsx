import { useEffect, useState } from 'react'
import { get, put } from '../../lib/api'

/** Pay options that are saved on their own: pay mode, allowances, overtime. */
export default function EmpPayExtras({ empId, toast }: { empId: number; toast: (t: string, bad?: boolean) => void }) {
  const [f, setF] = useState<{ payMode: string; allowances: string; otEligible: boolean } | null>(null)
  const [orig, setOrig] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    get(`/api/hr/employees/${empId}/pay`).then(p => {
      const v = { payMode: p.payMode ?? '', allowances: String(Number(p.allowances ?? 0)), otEligible: p.otEligible !== false }
      setF(v); setOrig(JSON.stringify(v))
    }).catch(() => setF({ payMode: '', allowances: '0', otEligible: true }))
  }, [empId])
  if (!f) return null
  const dirty = JSON.stringify(f) !== orig
  const bad = Number(f.allowances) < 0 || isNaN(Number(f.allowances))
  async function save() {
    if (!f) return
    setBusy(true)
    try {
      await put(`/api/hr/employees/${empId}/pay`, { payMode: f.payMode || null, allowances: Number(f.allowances), otEligible: f.otEligible })
      setOrig(JSON.stringify(f)); toast('Pay options saved')
    } catch (e: any) { toast(e.message, true) } finally { setBusy(false) }
  }
  return (
    <div className="full" style={{ marginTop: 6 }}>
      <div className="fieldset-title">Pay options</div>
      <label htmlFor="emppayex-f1">Pay mode</label>
      <select id="emppayex-f1" value={f.payMode} onChange={e => setF({ ...f, payMode: e.target.value })}>
        <option value="">Company default</option><option value="HOURLY">Hourly: hours × hourly rate</option><option value="MONTHLY">Monthly: fixed salary, loss of pay for missed days</option>
      </select>
      <label htmlFor="emppayex-f2">Allowances per month (added to pay)</label>
      <input id="emppayex-f2" type="number" min="0" value={f.allowances} onChange={e => setF({ ...f, allowances: e.target.value })} className={bad ? 'bad' : ''} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'inherit', marginTop: 12 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.otEligible} onChange={e => setF({ ...f, otEligible: e.target.checked })} /> Eligible for overtime pay
      </label>
      <div className="hint">These save separately with their own button. They apply to payroll runs generated afterwards.</div>
      {dirty && <p><button type="button" className="btn" disabled={busy || bad} onClick={save}>Save pay options</button></p>}
    </div>
  )
}
