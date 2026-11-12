import PunchCheckSheet, { type Issue } from '../components/PunchCheckSheet'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadFace, scanForFace, startCamera, stopCamera, snapFrame } from '../lib/face'
import { wifiBssid } from '../lib/deviceKey'

type Result = { outcome: string; employeeName: string | null; flagged: boolean; message: string }
type Pos = { lat: number; lng: number; accuracy: number }

/**
 * Face-only clock in/out with no sign-in: the server works out who it is from the face. Location and (in the Android app)
 * the WiFi access point are sent along; anything that does not check out is flagged for HR, never blocked.
 */
/** Third miss: identify with employee ID + phone, take a photo, and ask HR to approve the clock-in or clock-out. */
function PhotoRequest({ video, pos, onClose }: { video: React.RefObject<HTMLVideoElement>; pos: React.MutableRefObject<Pos | null>; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [action, setAction] = useState<'IN' | 'OUT'>('IN')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  function snap() {
    const v = video.current
    if (!v || !v.videoWidth) { setErr('The camera is not ready'); return }
    const w = 480, h = Math.round((w * v.videoHeight) / v.videoWidth)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d')!.drawImage(v, 0, 0, w, h)
    setPhoto(c.toDataURL('image/jpeg', 0.7)); setErr('')
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!photo) { setErr('Take a photo first'); return }
    setBusy(true); setErr('')
    try {
      const p = pos.current
      const res = await fetch('/api/public/face-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeCode: code, phone, action, photo, lat: p?.lat, lng: p?.lng, accuracy: p?.accuracy, bssid: wifiBssid() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? 'Request failed')
      setSent(true)
      setTimeout(onClose, 5000)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  if (sent) return <div className="result" style={{ color: 'var(--ok)' }}>Sent to HR<div className="muted" style={{ fontSize: 16 }}>You will be clocked {action === 'IN' ? 'in' : 'out'} at this time once HR approves.</div></div>
  return (
    <form onSubmit={send} className="card" style={{ width: 'min(420px, 100%)', textAlign: 'left' }}>
      <h2>We could not recognise you</h2>
      <p className="muted">Send your photo to HR for approval. Nothing is recorded until HR approves it.</p>
      <label htmlFor="facepunc-f1">Employee ID</label>
      <input id="facepunc-f1" value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" required />
      <label htmlFor="facepunc-f2">Phone number</label>
      <input id="facepunc-f2" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
      <label>I am</label>
      <div className="row">
        <button type="button" className={`btn${action === 'IN' ? '' : ' ghost'}`} onClick={() => setAction('IN')}>Clocking in</button>
        <button type="button" className={`btn${action === 'OUT' ? '' : ' ghost'}`} onClick={() => setAction('OUT')}>Clocking out</button>
      </div>
      <label>Photo (look at the camera above)</label>
      {photo && <img src={photo} alt="Your photo" style={{ width: '100%', borderRadius: 12, transform: 'scaleX(-1)' }} />}
      <p className="row"><button type="button" className="btn ghost" onClick={snap}>{photo ? 'Retake photo' : 'Take photo'}</button></p>
      {err && <div className="err">{err}</div>}
      <p className="row"><button className="btn" disabled={busy || !photo}>{busy ? 'Sending…' : 'Send for approval'}</button><button type="button" className="btn ghost" onClick={onClose}>Try scanning again</button></p>
    </form>
  )
}

export default function FacePunch() {
  const video = useRef<HTMLVideoElement>(null)
  const pos = useRef<Pos | null>(null)
  const busy = useRef(false)
  const clearTimer = useRef<number | undefined>(undefined)
  const [hint, setHint] = useState('Starting camera…')
  const [result, setResult] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const [now, setNow] = useState(new Date())
  const [noLocation, setNoLocation] = useState(false)
  const [fill, setFill] = useState(false) // dark room: the white screen lights the face
  const fails = useRef(0)
  const [askHr, setAskHr] = useState(false) // after 3 unrecognised scans: photo + request for HR approval
  const [attempt, setAttempt] = useState(0)
  // A check failed: nothing is recorded until the person fixes it or sends it to HR.
  const [sheet, setSheet] = useState<null | { descriptor: number[]; photo: string | null; issues: Issue[]; blocked: boolean; err: string; busy: boolean }>(null)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  // Keep the freshest GPS fix; it is sent with each punch.
  useEffect(() => {
    if (!('geolocation' in navigator)) { setNoLocation(true); return }
    const id = navigator.geolocation.watchPosition(
      p => { pos.current = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }; setNoLocation(false) },
      () => setNoLocation(true),
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  useEffect(() => {
    let stop = false
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        await loadFace()
        stream = await startCamera(video.current!)
      } catch (e: any) { if (!stop) setErr(e.message ?? 'Camera unavailable'); return }
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
          try {
            const p = pos.current
            const res = await fetch('/api/public/face-punch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ descriptor, lat: p?.lat, lng: p?.lng, accuracy: p?.accuracy, bssid: wifiBssid() }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.message ?? 'Request failed')
            setErr('')
            if (data.outcome === 'NEEDS_CONFIRMATION' || data.outcome === 'PUNCH_BLOCKED') {
              setSheet({ descriptor, photo: snapFrame(video.current), issues: data.issues ?? [], blocked: data.outcome === 'PUNCH_BLOCKED', err: '', busy: false })
              setHint('')
              return   // scanning stays paused (busy) until the person chooses
            }
            const missed = data.outcome === 'NOT_RECOGNISED' || data.outcome === 'AMBIGUOUS'
            fails.current = missed ? fails.current + 1 : 0
            setAttempt(fails.current)
            if (missed && fails.current >= 3) {
              // Third miss: stop scanning and offer the photo request (busy stays on until the form closes).
              setResult(null); setAskHr(true)
              return
            }
            setResult(data)
            window.clearTimeout(clearTimer.current)
            clearTimer.current = window.setTimeout(() => { setResult(null); busy.current = false }, 4500)
          } catch (e: any) {
            setErr(e.message); busy.current = false
          }
          setHint('Look at the camera')
        },
      })
    })()
    return () => { stop = true; stopCamera(stream) }
  }, [])

  const ok = result && ['CHECKED_IN', 'CHECKED_OUT'].includes(result.outcome)

  async function sendToHr(note: string) {
    if (!sheet) return
    setSheet({ ...sheet, busy: true, err: '' })
    try {
      const p = pos.current
      const res = await fetch('/api/public/face-punch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor: sheet.descriptor, lat: p?.lat, lng: p?.lng, accuracy: p?.accuracy, bssid: wifiBssid(), confirm: true, note, photo: sheet.photo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? 'Request failed')
      setSheet(null)
      setResult(data)
      window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => { setResult(null); busy.current = false }, 4500)
    } catch (e: any) {
      setSheet(sh => sh && { ...sh, busy: false, err: e.message })
    }
  }
  const closeSheet = () => { setSheet(null); setHint('Look at the camera'); busy.current = false }
  return (
    <div className={`kiosk${fill ? ' fill-light' : ''}`}>
      {sheet && <PunchCheckSheet issues={sheet.issues} blocked={sheet.blocked} busy={sheet.busy} error={sheet.err} onRetry={closeSheet} onSend={sendToHr} onCancel={closeSheet} />}
      <div className="clock" style={{ fontSize: 56 }}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div style={{ width: 'min(420px, 100%)' }}>
        <video ref={video} autoPlay muted playsInline style={{ width: '100%', borderRadius: 16, transform: 'scaleX(-1)', background: '#000', display: result ? 'none' : 'block' }} />
      </div>
      {askHr ? (
        <PhotoRequest video={video} pos={pos} onClose={() => { fails.current = 0; setAttempt(0); setAskHr(false); busy.current = false }} />
      ) : result ? (
        <div className="result" style={{ color: ok ? 'var(--ok)' : 'var(--bad)' }}>
          {result.message}
          {ok && result.flagged && <div className="muted" style={{ fontSize: 16 }}>Sent to HR for approval.</div>}
          {(result.outcome === 'NOT_RECOGNISED' || result.outcome === 'AMBIGUOUS') && <div className="muted" style={{ fontSize: 16 }}>Try {attempt} of 3. Face the light and look straight at the camera.</div>}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 20 }}>{hint}</div>
      )}
      {err && <div className="err">{err}</div>}
      {noLocation && !result && <div className="muted" style={{ fontSize: 14 }}>Location is off, so HR may need to confirm your punch.</div>}
      <p className="muted" style={{ fontSize: 14 }}><Link to="/login">Sign in</Link> to see your timesheet and payslips</p>
    </div>
  )
}
