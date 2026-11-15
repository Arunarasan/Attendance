import { FormEvent, useEffect, useRef, useState } from 'react'
import { loadFace, scanForFace, snapFrame, startCamera, stopCamera } from '../lib/face'

const KEY = 'attendance.kiosk'
type Result = { outcome: string; employeeName: string | null; flagged: boolean; message: string; photo?: string | null }
type Action = 'IN' | 'OUT'

async function kioskCall<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Kiosk-Token': token } : {}) },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.message ?? 'Request failed'), { status: res.status })
  return data as T
}

/**
 * Shared office device. Home screen: Check in / Check out. Tapping one opens the camera in a phone-sized frame; the face (or a typed
 * ID) is matched and a card with the person's photo says welcome, already checked in, or not recognised. An unrecognised person can send
 * their photo + ID to HR for approval.
 */
export default function Kiosk() {
  const [token, setToken] = useState<string | null>(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  const [code, setCode] = useState('')
  const [id, setId] = useState('')
  const [phone, setPhone] = useState('')
  const [action, setAction] = useState<Action | null>(null) // null = home screen
  const [mode, setMode] = useState<'face' | 'id'>('face')
  const [hint, setHint] = useState('Starting camera…')
  const [result, setResult] = useState<Result | null>(null)
  const [approval, setApproval] = useState<null | { photo: string | null; sent: boolean; busy: boolean }>(null)
  const [err, setErr] = useState('')
  const [now, setNow] = useState(new Date())
  const [fill, setFill] = useState(false)
  const [idPhoto, setIdPhoto] = useState<string | null>(null) // photo taken in the ID flow
  const [idBusy, setIdBusy] = useState(false)
  const clearTimer = useRef<number | undefined>(undefined)
  const video = useRef<HTMLVideoElement>(null)
  const busy = useRef(false) // true while a result is shown or a request is in flight

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  function home() {
    window.clearTimeout(clearTimer.current)
    setResult(null); setApproval(null); setAction(null); setErr(''); setId(''); setPhone(''); setIdPhoto(null); setMode('face'); busy.current = false
  }

  function show(r: Result) {
    setResult(r)
    window.clearTimeout(clearTimer.current)
    const done = ['CHECKED_IN', 'CHECKED_OUT', 'ALREADY_IN', 'NOT_IN', 'TOO_SOON'].includes(r.outcome)
    // Failures stay until the person chooses what to do; successes return to the home screen by themselves.
    if (done) clearTimer.current = window.setTimeout(home, 5000)
  }

  function lostToken(e: any) {
    if (e.status === 401) { try { localStorage.removeItem(KEY) } catch { /* ignore */ } setToken(null) }
  }

  // Camera + scan loop: only after Check in / Check out was tapped
  useEffect(() => {
    if (!token || !action || mode !== 'face') return
    let stop = false
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        await loadFace()
        stream = await startCamera(video.current!)
      } catch (e: any) {
        if (!stop) { setHint(e.message ?? 'Camera unavailable'); setMode('id') }
        return
      }
      if (stop) { stopCamera(stream); return }
      setHint('Look at the camera')
      await scanForFace({
        video: video.current!,
        isStopped: () => stop,
        isPaused: () => busy.current,
        onHint: setHint,
        onLight: setFill,
        onDescriptor: async descriptor => {
          busy.current = true
          setHint('Checking…')
          const photo = snapFrame(video.current)
          try {
            show({ ...(await kioskCall<Result>('/api/public/kiosk/punch', { descriptor, action }, token!)), photo })
          } catch (e: any) {
            lostToken(e); setErr(e.message); busy.current = false
          }
          setHint('Look at the camera')
        },
      })
    })()
    return () => { stop = true; stopCamera(stream) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, action, mode])

  // ID flow: camera only (no scanning), so the person can take their own photo
  useEffect(() => {
    if (!token || !action || mode !== 'id') return
    let stop = false
    let stream: MediaStream | null = null
    ;(async () => {
      try { stream = await startCamera(video.current!) }
      catch (e: any) { if (!stop) setErr(e.message ?? 'Camera unavailable'); return }
      if (stop) stopCamera(stream)
    })()
    return () => { stop = true; stopCamera(stream) }
  }, [token, action, mode])

  async function pair(e: FormEvent) {
    e.preventDefault(); setErr('')
    try {
      const r = await kioskCall<{ token: string }>('/api/public/kiosk/pair', { code: code.trim() })
      try { localStorage.setItem(KEY, r.token) } catch { /* ignore */ }
      setToken(r.token)
    } catch (e: any) { setErr(e.message) }
  }

  /** ID + phone + a photo taken here: goes to HR as an approval request; nothing is recorded until HR approves. */
  async function sendId(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!idPhoto) { setErr('Take your photo first'); return }
    setIdBusy(true)
    try {
      await kioskCall('/api/public/face-request', { employeeCode: id, phone, action, photo: idPhoto })
      setApproval({ photo: idPhoto, sent: true, busy: false })
      window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(home, 5000)
    } catch (e: any) { setErr(e.message) } finally { setIdBusy(false) }
  }

  async function sendApproval(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!approval?.photo) { setErr('No photo was taken. Try scanning again.'); return }
    setApproval({ ...approval, busy: true })
    try {
      await kioskCall('/api/public/face-request', { employeeCode: id, phone, action, photo: approval.photo })
      setApproval({ ...approval, busy: false, sent: true })
      window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(home, 5000)
    } catch (e: any) { setErr(e.message); setApproval({ ...approval, busy: false }) }
  }

  function retry() {
    window.clearTimeout(clearTimer.current)
    setResult(null); setApproval(null); setErr(''); busy.current = false
  }

  if (!token) {
    return (
      <div className="wrap narrow"><div className="card"><h2>Pair this kiosk</h2>
        <p className="muted">Ask HR for a kiosk pairing code.</p>
        <form onSubmit={pair}><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} required />
          {err && <div className="err">{err}</div>}<p><button className="btn big">Pair</button></p></form></div></div>
    )
  }

  const clock = <div className="clock" style={{ fontSize: 56 }}>{now.toLocaleTimeString([], { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</div>

  // ---- Home: Check in / Check out ----
  if (!action) {
    return (
      <div className="kiosk">
        {clock}
        <div className="muted">{now.toLocaleDateString([], { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="kiosk-home">
          <button className="btn big kiosk-in" onClick={() => setAction('IN')}>Check in</button>
          <button className="btn big kiosk-out" onClick={() => setAction('OUT')}>Check out</button>
        </div>
      </div>
    )
  }

  const verb = action === 'IN' ? 'Check in' : 'Check out'
  const ok = !!result && ['CHECKED_IN', 'CHECKED_OUT'].includes(result.outcome)
  const warn = !!result && ['ALREADY_IN', 'NOT_IN', 'TOO_SOON'].includes(result.outcome)
  const miss = !!result && !ok && !warn
  const tone = ok ? 'ok' : warn ? 'warn' : 'bad'
  const title = !result ? '' : ok ? (result.outcome === 'CHECKED_IN' ? 'Welcome' : 'Goodbye')
    : result.outcome === 'ALREADY_IN' ? 'Already checked in' : result.outcome === 'NOT_IN' ? 'Not checked in yet'
    : result.outcome === 'TOO_SOON' ? 'Already done' : 'Not recognised'

  return (
    <div className={`kiosk${fill ? ' fill-light' : ''}`}>
      {clock}
      <div className="kiosk-phone">
        <div className="kiosk-phone-head"><strong>{verb}</strong><button className="btn ghost" onClick={home}>Cancel</button></div>

        <video ref={video} autoPlay muted playsInline className="kiosk-video"
          style={{ display: result || approval || (mode === 'id' && idPhoto) ? 'none' : 'block' }} />
        {mode === 'id' && idPhoto && !result && !approval && <img src={idPhoto} alt="Your photo" className="kiosk-video" />}

        {result && !approval && (
          <div className={`kiosk-card ${tone}`}>
            {result.photo
              ? <img src={result.photo} alt="" className="kiosk-photo" />
              : result.employeeName && <div className="kiosk-photo initials">{result.employeeName.slice(0, 1)}</div>}
            <div className="kiosk-title">{title}</div>
            {result.employeeName && <div className="kiosk-name">{result.employeeName}</div>}
            <div className="muted">{ok ? now.toLocaleTimeString([], { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : result.message}</div>
            {ok && result.flagged && <div className="muted" style={{ fontSize: 15 }}>Recorded. HR will confirm it.</div>}
            {miss && (
              <div className="kiosk-actions">
                <button className="btn" onClick={retry}>Try again</button>
                {result.photo && <button className="btn ghost" onClick={() => setApproval({ photo: result.photo ?? null, sent: false, busy: false })}>Send photo to HR for approval</button>}
                <button className="btn ghost" onClick={() => { retry(); setMode('id') }}>Use my ID</button>
              </div>
            )}
            {warn && <button className="btn ghost" onClick={home}>OK</button>}
          </div>
        )}

        {approval && (approval.sent ? (
          <div className="kiosk-card ok"><div className="kiosk-title">Sent to HR</div>
            <div className="muted">You will be clocked {action === 'IN' ? 'in' : 'out'} at this time once HR approves.</div></div>
        ) : (
          <form onSubmit={sendApproval} className="kiosk-card bad" style={{ textAlign: 'left' }}>
            {approval.photo && <img src={approval.photo} alt="Your photo" className="kiosk-photo" />}
            <p className="muted">Nothing is recorded until HR approves your photo.</p>
            <label htmlFor="kiosk-a1">Employee ID</label>
            <input id="kiosk-a1" value={id} onChange={e => setId(e.target.value)} required />
            <label htmlFor="kiosk-a2">Phone number</label>
            <input id="kiosk-a2" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
            <p className="row"><button className="btn" disabled={approval.busy}>{approval.busy ? 'Sending…' : 'Send for approval'}</button>
              <button type="button" className="btn ghost" onClick={retry}>Back</button></p>
          </form>
        ))}

        {!result && !approval && (mode === 'face' ? (
          <div className="muted" style={{ fontSize: 20 }}>{hint}</div>
        ) : (
          <form onSubmit={sendId}>
            <label htmlFor="kiosk-f1">Employee ID</label>
            <input id="kiosk-f1" value={id} onChange={e => setId(e.target.value)} autoFocus required />
            <label htmlFor="kiosk-f2">Phone number</label>
            <input id="kiosk-f2" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
            <p className="row">
              <button type="button" className="btn ghost" onClick={() => idPhoto ? setIdPhoto(null) : (snapFrame(video.current) ? setIdPhoto(snapFrame(video.current)) : setErr('The camera is not ready'))}>{idPhoto ? 'Retake photo' : 'Take photo'}</button>
              <button className="btn" disabled={idBusy || !idPhoto}>{idBusy ? 'Sending…' : 'Send for approval'}</button>
            </p>
            <p className="muted" style={{ fontSize: 14 }}>Your photo goes to HR. Nothing is recorded until HR approves it.</p>
          </form>
        ))}

        {err && <div className="err">{err}</div>}
        {!result && !approval && <button className="btn ghost" onClick={() => { setErr(''); setMode(mode === 'face' ? 'id' : 'face') }}>{mode === 'face' ? 'Use my ID instead' : 'Use face scan'}</button>}
      </div>
    </div>
  )
}
