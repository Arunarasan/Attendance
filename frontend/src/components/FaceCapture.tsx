import { useEffect, useRef, useState } from 'react'
import { loadFace, scanForFace, snapFrame, startCamera, stopCamera } from '../lib/face'

/**
 * Opens the camera, waits for one face plus a small head turn (a deterrent against a held-up photo), then returns its
 * descriptor (averaged over several frames). `onCancel` lets the person skip; the server then flags the punch for HR.
 */
export default function FaceCapture({ title, onDone, onCancel }: { title: string; onDone: (descriptor: number[], photo: string | null) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [hint, setHint] = useState('Starting camera…')
  const [err, setErr] = useState('')
  const [fill, setFill] = useState(false)

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
        video: video.current!, isStopped: () => stop, onHint: setHint, onLight: setFill, once: true,
        onDescriptor: d => { const photo = snapFrame(video.current); stop = true; stopCamera(stream); onDone(d, photo) },
      })
    })()
    return () => { stop = true; stopCamera(stream) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="card" style={fill ? { background: '#fff', color: '#111' } : undefined}>
      <h2>{title}</h2>
      <video ref={video} autoPlay muted playsInline style={{ width: '100%', maxWidth: 360, borderRadius: 12, background: '#000', transform: 'scaleX(-1)' }} />
      {err ? <div className="err">{err}</div> : <p className="muted">{hint}</p>}
      <button className="btn ghost" onClick={onCancel}>{err ? 'Continue without face' : 'Skip'}</button>
    </div>
  )
}
