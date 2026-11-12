import { FormEvent, useState } from 'react'
import { post } from '../lib/api'
import './login.css'

/**
 * Shown instead of the app while the account still has the shipped default password.
 * The server refuses everything else until a new password is set, so this is not just a courtesy.
 */
export default function ChangePasswordRequired({ name, onDone, onLogout }: { name: string; onDone: () => void; onLogout: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (next.length < 8) { setErr('The new password must be at least 8 characters.'); return }
    if (next !== again) { setErr('The two new passwords do not match.'); return }
    setBusy(true)
    try {
      await post('/api/me/password', { currentPassword: current, newPassword: next })
      onDone()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lg">
      <div className="lg-bg" aria-hidden="true" />
      <main className="lg-main">
        <header className="lg-brand">
          <img className="lg-logo-img" src="/logo.webp" alt="Arudra Attender" />
        </header>
        <section className="lg-card">
          <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Set a new password</h1>
          <p className="lg-sub">Hello {name}. This account still uses the default password, which everyone can look up. Choose your own before you continue.</p>
          <form onSubmit={submit}>
            <div className="lg-field">
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} aria-label="Current password" placeholder="Current password" autoComplete="current-password" required />
            </div>
            <div className="lg-field">
              <input type="password" value={next} onChange={e => setNext(e.target.value)} aria-label="New password" placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="lg-field">
              <input type="password" value={again} onChange={e => setAgain(e.target.value)} aria-label="Repeat the new password" placeholder="Repeat the new password" autoComplete="new-password" minLength={8} required />
            </div>
            {err && <div className="lg-err" role="alert">{err}</div>}
            <button className="lg-primary" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
          </form>
          <p className="lg-foot"><a href="#" className="lg-link" onClick={e => { e.preventDefault(); onLogout() }}>Sign out</a></p>
        </section>
      </main>
    </div>
  )
}
