import { useEffect, useState } from 'react'
import { blobUrl, fmtDateTime, fmtTime, get, post } from '../lib/api'
import { IAlert, IArrowR, ICal, ICheckCircle, IClock, IFace, IPin, IX } from '../components/icons'
import './leaveHolidays.css'
import './attendanceAdmin.css'
import './approvalsAdmin.css'

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path])
  return { data, err, reload }
}
const initials = (name: string) => (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

export function Approvals() {
  const { data, err, reload } = useLoad<any[]>('/api/hr/attendance/pending')
  const [sel, setSel] = useState<number[]>([])
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState('')
  const act = async (id: number, a: 'approve' | 'reject') => {
    setMsg(''); setBad('')
    try { await post(`/api/hr/attendance/sessions/${id}/${a}`); setSel(s => s.filter(x => x !== id)); reload() } catch (e: any) { setBad(e.message) }
  }
  const many = async () => {
    setMsg(''); setBad('')
    try {
      const r = await post('/api/hr/attendance/sessions/approve-many', { ids: sel })
      setMsg(`Approved ${r.approved}${r.failed.length ? `. Skipped: ${r.failed.join(', ')}` : ''}`); setSel([]); reload()
    } catch (e: any) { setBad(e.message) }
  }
  const all = data ?? []
  const allOn = all.length > 0 && sel.length === all.length
  return (<>
    <div className="lh-stats">
      <div className="lh-stat y"><span><IAlert size={26} /></span><b>{all.length}</b><small>Punches waiting for approval</small></div>
      <div className="lh-stat g"><span><ICheckCircle size={26} /></span><b>{sel.length}</b><small>Selected</small></div>
    </div>

    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>To approve</h3><p>Punches flagged for a check, such as a wrong location or network. Approve the ones that look right.</p></div>
        {all.length > 0 && <button className="lh-add" onClick={() => setSel(allOn ? [] : all.map(s => s.id))}>{allOn ? 'Clear selection' : 'Select all'}</button>}</div>
      {(err || bad) && <div className="err">{err || bad}</div>}{msg && <div className="msg">{msg}</div>}
      {data && all.length === 0 && <div className="lh-empty"><ICheckCircle size={34} /><b>All caught up</b><small>Nothing is waiting. Flagged punches appear here.</small></div>}
      <div className="lh-reqs">
        {all.map(s => {
          const on = sel.includes(s.id)
          return (
            <div key={s.id} className={`lh-req ap-req${on ? ' sel' : ''}`}>
              <label className="ap-check"><input type="checkbox" checked={on} onChange={e => setSel(e.target.checked ? [...sel, s.id] : sel.filter(x => x !== s.id))} aria-label={`Select ${s.employeeName}`} /><i /></label>
              <span className="lh-av">{initials(s.employeeName)}</span>
              <div className="lh-req-m">
                <b>{s.employeeName}</b><small>{s.employeeCode}</small>
                <div className="lh-req-d"><ICal size={16} />{new Date(s.workDate + 'T00:00').toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
                <div className="lh-req-d"><IClock size={16} />{fmtTime(s.clockIn)} <IArrowR size={14} /> {s.clockOut ? fmtTime(s.clockOut) : 'open'}
                  <span className="lh-chip">{s.source}</span></div>
                <div className="ap-flag"><IAlert size={16} /><span>{s.flagReason}</span>{s.distanceMeters != null && <em><IPin size={13} />{Math.round(s.distanceMeters)} m from office</em>}</div>
              </div>
              <div className="lh-req-a">
                <button className="lh-ok" onClick={() => act(s.id, 'approve')}><ICheckCircle size={18} />Approve</button>
                <button className="lh-no" onClick={() => act(s.id, 'reject')}><IX size={18} />Reject</button>
              </div>
            </div>)
        })}
      </div>
    </section>

    {sel.length > 0 && <div className="ap-bar"><span><b>{sel.length}</b> selected</span><button className="lh-ok" onClick={many}><ICheckCircle size={18} />Approve {sel.length}</button><button className="ap-clear" onClick={() => setSel([])}>Clear</button></div>}
  </>)
}

function RequestPhoto({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    blobUrl(`/api/hr/face-requests/${id}/photo`).then(x => { u = x; setUrl(x) }).catch(() => setUrl(null))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [id])
  return url ? <img className="ap-photo" src={url} alt="Photo sent with the request" /> : <span className="ap-photo none"><IFace size={30} />No photo</span>
}

export function PhotoRequests() {
  const { data, reload } = useLoad<any[]>('/api/hr/face-requests')
  const [err, setErr] = useState('')
  const act = async (id: number, a: 'approve' | 'reject') => {
    setErr('')
    try { await post(`/api/hr/face-requests/${id}/${a}`); reload() } catch (e: any) { setErr(e.message) }
  }
  return (<>
    <div className="lh-stats" style={{ gridTemplateColumns: '1fr' }}>
      <div className="lh-stat y"><span><IFace size={26} /></span><b>{data?.length ?? 0}</b><small>Photo requests waiting</small></div>
    </div>
    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>Photo requests</h3></div></div>
      <div className="ap-note"><IAlert size={18} /><p>The face scan failed three times, so the employee sent a photo with their ID and phone number. Check the photo really is that person before approving. Approving clocks them in or out at the time they asked, and the photo is deleted 30 days after your decision.</p></div>
      {err && <div className="err">{err}</div>}
      {data?.length === 0 && <div className="lh-empty"><ICheckCircle size={34} /><b>All caught up</b><small>No requests waiting.</small></div>}
      <div className="lh-reqs">
        {data?.map(r => (
          <div key={r.id} className="lh-req">
            <RequestPhoto id={r.id} />
            <div className="lh-req-m">
              <b>{r.employeeName}</b><small>{r.employeeCode}</small>
              <div className="lh-req-chips"><span className={`lh-chip ${r.action === 'IN' ? 'ok' : 'warn'}`}><IClock size={14} />Wants to clock {r.action === 'IN' ? 'in' : 'out'}</span></div>
              <div className="lh-req-d"><ICal size={16} />{fmtDateTime(r.requestedAt)}</div>
              {r.context && <div className="lh-req-d"><IPin size={16} />{r.context}</div>}
            </div>
            <div className="lh-req-a">
              <button className="lh-ok" onClick={() => act(r.id, 'approve')}><ICheckCircle size={18} />Approve</button>
              <button className="lh-no" onClick={() => act(r.id, 'reject')}><IX size={18} />Reject</button>
            </div>
          </div>))}
      </div>
    </section>
  </>)
}
