import { FormEvent, useEffect, useRef, useState } from 'react'
import { loadFace, scanForFace, startCamera, stopCamera } from '../lib/face'

const KEY = 'attendance.kiosk'
type Result = { outcome: string; employeeName: string | null; flagged: boolean; message: string }

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

/** Shared office device: face scan (with a small head turn as a liveness deterrent), or typed ID as a fallback. */
export default function Kiosk() {
  const [token, setToken] = useState<string | null>(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  const [code, setCode] = useState('')
  const [id, setId] = useState('')
  const [mode, setMode] = useState<'face' | 'id'>('face')
  const [hint, setHint] = useState('Starting camera…')
  const [result, setResult] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const [now, setNow] = useState(new Date())
  const [fill, setFill] = useState(false)
  const clearTimer = useRef<number | undefined>(undefined)
  const video = useRef<HTMLVideoElement>(null)
  const busy = useRef(false) // true while a result is shown or a request is in flight

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  function show(r: Result) {
    setResult(r)
    window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => { setResult(null); busy.current = false }, 4500)
  }

  function lostToken(e: any) {
    if (e.status === 401) { try { localStorage.removeItem(KEY) } catch { /* ignore */ } setToken(null) }
  }

  // Camera + scan loop
  useEffect(() => {
    if (!token || mode !== 'face') return
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
          try {
            show(await kioskCall<Result>('/api/public/kiosk/punch', { descriptor }, token!))
          } catch (e: any) {
            lostToken(e); setErr(e.message); busy.current = false
          }
          setHint('Look at the camera')
        },
      })
    })()
    return () => { stop = true; stopCamera(stream) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mode])

  async function pair(e: FormEvent) {
    e.preventDefault(); setErr('')
    try {
      const r = await kioskCall<{ token: string }>('/api/public/kiosk/pair', { code: code.trim() })
      try { localStorage.setItem(KEY, r.token) } catch { /* ignore */ }
      setToken(r.token)
    } catch (e: any) { setErr(e.message) }
  }

  async function punchId(e: FormEvent) {
    e.preventDefault(); setErr('')
    try {
      busy.current = true
      show(await kioskCall<Result>('/api/public/kiosk/punch-manual', { identifier: id }, token!))
      setId('')
    } catch (e: any) { busy.current = false; lostToken(e); setErr(e.message) }
  }

  if (!token) {
    return (
      <div className="wrap narrow"><div className="card"><h2>Pair this kiosk</h2>
        <p className="muted">Ask HR for a kiosk pairing code.</p>
        <form onSubmit={pair}><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} required />
          {err && <div className="err">{err}</div>}<p><button className="btn big">Pair</button></p></form></div></div>
    )
  }

  const ok = result && ['CHECKED_IN', 'CHECKED_OUT'].includes(result.outcome)
  return (
    <div className={`kiosk${fill ? ' fill-light' : ''}`}>
      <div className="clock" style={{ fontSize: 64 }}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      {mode === 'face' && (
        <div style={{ position: 'relative', width: 'min(420px, 100%)' }}>
          <video ref={video} autoPlay muted playsInline style={{ width: '100%', borderRadius: 16, transform: 'scaleX(-1)', background: '#000', display: result ? 'none' : 'block' }} />
        </div>
      )}
      {result ? (
        <div className="result" style={{ color: ok ? 'var(--ok)' : 'var(--bad)' }}>
          {result.message}
          {ok && result.flagged && <div className="muted" style={{ fontSize: 16 }}>Recorded. HR will confirm it.</div>}
          {result.outcome === 'NOT_RECOGNISED' && <div className="muted" style={{ fontSize: 16 }}>Try again, or use your ID.</div>}
        </div>
      ) : mode === 'face' ? (
        <div className="muted" style={{ fontSize: 20 }}>{hint}</div>
      ) : (
        <form onSubmit={punchId} style={{ width: 'min(360px, 100%)' }}>
          <label>Employee ID or phone</label>
          <input value={id} onChange={e => setId(e.target.value)} autoFocus required style={{ fontSize: 22, textAlign: 'center' }} />
          <p><button className="btn big">Punch in / out</button></p>
        </form>
      )}
      {err && <div className="err">{err}</div>}
      {!result && <button className="btn ghost" onClick={() => { setErr(''); setMode(mode === 'face' ? 'id' : 'face') }}>{mode === 'face' ? 'Use my ID instead' : 'Use face scan'}</button>}
    </div>
  )
}

