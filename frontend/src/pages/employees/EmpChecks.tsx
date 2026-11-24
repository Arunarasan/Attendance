import { useEffect, useState } from 'react'
import { fmtDateTime, get, post, put } from '../../lib/api'
import { Emp } from './ui'

type Toast = (t: string, bad?: boolean) => void
const KEYS = [
  ['requireLocation', 'Location check', 'Must be inside an office location to punch.'],
  ['requireWifi', 'Wi-Fi check', 'Must be on the office network to punch.'],
  ['allowKiosk', 'Kiosk punching', 'May punch at the office kiosk.'],
] as const

/** Per-employee switches (saved at once) and this employee's phones with approve / revoke. */
export default function EmpChecks({ emp, toast, onChanged }: { emp: Emp; toast: Toast; onChanged: () => void }) {
  const [on, setOn] = useState({ requireLocation: emp.requireLocation !== false, requireWifi: emp.requireWifi !== false, allowKiosk: emp.allowKiosk !== false })
  const [phones, setPhones] = useState<any[] | null>(null)
  const loadPhones = () => get<any[]>('/api/hr/attendance/devices').then(d => setPhones(d.filter(x => x.employeeId === emp.id))).catch(() => setPhones([]))
  useEffect(() => { loadPhones() /* eslint-disable-next-line */ }, [emp.id])

  async function flip(k: keyof typeof on) {
    const next = { ...on, [k]: !on[k] }
    setOn(next)
    try { await put(`/api/hr/employees/${emp.id}/checks`, { [k]: next[k] }); toast('Saved'); onChanged() }
    catch (e: any) { setOn(on); toast(e.message, true) }
  }
  async function phone(id: number, a: 'approve' | 'revoke') {
    try { await post(`/api/hr/attendance/devices/${id}/${a}`); toast(a === 'approve' ? 'Phone approved' : 'Phone revoked'); loadPhones(); onChanged() }
    catch (e: any) { toast(e.message, true) }
  }

  return (<>
    <div className="action-row" style={{ display: 'block' }}>
      <b>Phones</b>
      {phones && phones.length === 0 && <div className="muted">No phone registered.</div>}
      {phones?.map(d => (
        <div key={d.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <div style={{ minWidth: 0 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label || 'Phone'}</div>
            <span className="muted">{d.status === 'PENDING' ? 'Waiting for approval' : 'Approved'} · {fmtDateTime(d.createdAt)}</span></div>
          <div className="row">{d.status === 'PENDING' && <button className="btn" onClick={() => phone(d.id, 'approve')}>Approve</button>}
            <button className="btn ghost" onClick={() => phone(d.id, 'revoke')}>Revoke</button></div>
        </div>))}
    </div>
    {KEYS.map(([k, title, hint]) => (
      <div key={k} className="action-row">
        <div><b>{title}</b><div className="muted">{on[k] ? hint : 'Turned off for this employee.'}</div></div>
        <label className="tgl"><input type="checkbox" role="switch" aria-label={title} checked={on[k]} onChange={() => flip(k)} /><i /></label>
      </div>))}
  </>)
}
