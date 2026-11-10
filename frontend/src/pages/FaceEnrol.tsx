import { useEffect, useRef, useState } from 'react'
import { post } from '../lib/api'
import { detectOnce, loadFace, startCamera, stopCamera } from '../lib/face'

const SHOTS = 8
// Variety is what makes recognition hold up later: straight, small turns, up and down.
const PROMPTS = ['Look straight at the camera', 'Look straight, relax your face', 'Turn slightly left', 'Turn slightly right', 'Tilt your chin up a little', 'Tilt your chin down a little', 'Look straight, smile', 'Look straight']

/** Captures eight shots with small pose changes (brightened first if the room is dark) and stores them for matching. */
export default function FaceEnrol({ employee, onClose, endpoint }: { employee: { id: number; name: string }; onClose: () => void; endpoint?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [shots, setShots] = useState(0)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [dark, setDark] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let dead = false
    ;(async () => {
      try {
        await loadFace()
        stream = await startCamera(video.current!)
        if (dead) stopCamera(stream); else setReady(true)
      } catch (e: any) { if (!dead) setErr(e.message ?? 'Camera unavailable') }
    })()
    return () => { dead = true; stopCamera(stream) }
  }, [])

  async function capture() {
    setBusy(true); setErr(''); setMsg(''); setShots(0)
    const found: number[][] = []
    try {
      for (let tries = 0; found.length < SHOTS && tries < 80; tries++) {
        const c = await detectOnce(video.current!)
        if (c) setDark(c.luma < 70)
        if (c && c.box.width >= 130 && c.score >= 0.6) {
          // The first shots must face the camera; later ones may turn a little.
          if (found.length < 2 && Math.abs(c.yaw) > 0.15) { setMsg(PROMPTS[found.length]); await sleep(250); continue }
          found.push(c.descriptor); setShots(found.length)
          setMsg(found.length < SHOTS ? `${found.length} of ${SHOTS}. Next: ${PROMPTS[found.length].toLowerCase()}` : 'Saving…')
          await sleep(1100) // time to change pose
        } else {
          setMsg(c ? 'Come a little closer and face the light' : 'Face the camera, in good light')
          await sleep(300)
        }
      }
      if (found.length < SHOTS) throw new Error('Could not capture enough clear shots. Face a light and try again.')
      await post(endpoint ?? `/api/hr/employees/${employee.id}/face`, { descriptors: found })
      setMsg(`Face enrolled for ${employee.name}.`)
    } catch (e: any) { setErr(e.message); setMsg('') } finally { setBusy(false) }
  }

  return (
    <div className="card" style={dark ? { background: '#fff', color: '#111' } : undefined}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Enrol face: {employee.name}</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <video ref={video} autoPlay muted playsInline style={{ width: 'min(360px, 100%)', borderRadius: 12, background: '#000', transform: 'scaleX(-1)' }} />
      <p className="muted">Face a window or lamp, alone in the frame, no hat or tinted glasses. Eight quick shots: follow the prompts. Replaces any earlier enrolment. The system also keeps learning your look from clean punches.</p>
      {err && <div className="err">{err}</div>}{msg && <div className="msg">{msg}</div>}
      <button className="btn" disabled={!ready || busy} onClick={capture}>{busy ? `Capturing ${shots}/${SHOTS}…` : ready ? 'Capture' : 'Starting camera…'}</button>
    </div>
  )
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
