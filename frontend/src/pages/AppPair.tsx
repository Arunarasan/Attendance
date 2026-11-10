import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { post, setAuth } from '../lib/api'
import { publicKeyB64, wifiBssid } from '../lib/deviceKey'

/** Optional pair-once sign-in: a one-time code from HR + this phone's key -> long-lived revocable device token. */
export default function AppPair({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const r = await post<{ deviceToken: string }>('/api/public/app/pair', {
        code: code.trim(), publicKey: await publicKeyB64(), label: navigator.userAgent.slice(0, 100), bssid: wifiBssid(),
      })
      setAuth({ kind: 'device', token: r.deviceToken })
      onDone()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap narrow">
      <div className="card">
        <h2>Pair this phone</h2>
        <p className="muted">Ask HR for your 8-character pairing code and connect to the office WiFi. You only do this once; after that the app opens straight to the clock. Most people simply <Link to="/login">sign in</Link> instead.</p>
        <form onSubmit={submit}>
          <label>Pairing code</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} autoCapitalize="characters" required />
          {err && <div className="err">{err}</div>}
          <p><button className="btn big" disabled={busy || code.length < 8}>{busy ? 'Pairing…' : 'Pair'}</button></p>
        </form>
      </div>
    </div>
  )
}
