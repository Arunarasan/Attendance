import { FormEvent, ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { post, setAuth } from '../lib/api'
import './login.css'

const REMEMBER_KEY = 'attendance.lastId'
const readRemembered = () => { try { return localStorage.getItem(REMEMBER_KEY) ?? '' } catch { return '' } }

const Svg = ({ children, size = 22 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const IconUser = () => <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></Svg>
const IconLock = () => <Svg><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
const IconEye = ({ off }: { off: boolean }) => <Svg>{off ? <><path d="M3 3l18 18" /><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c5 0 8.5 4 9.5 6a12 12 0 0 1-2.6 3.3M6.5 7.6C4.4 9 3 11 2.5 12c1 2 4.5 6 9.5 6 1.3 0 2.5-.3 3.6-.7" /><path d="M9.9 10a3 3 0 0 0 4.1 4.1" /></> : <><path d="M2.5 12C3.5 10 7 6 12 6s8.500 4 9.500 6c-1 2-4.500 6-9.500 6S3.500 14 2.500 12z" /><circle cx="12" cy="12" r="3" /></>}</Svg>
const IconArrow = () => <Svg size={20}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
const IconFace = () => <Svg size={20}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M9 10v1M15 10v1M9.500 15c.7.7 1.500 1 2.500 1s1.800-.3 2.500-1" /></Svg>
const IconCalendar = () => <Svg size={34}><rect x="3.500" y="5" width="17" height="15.500" rx="3" /><path d="M8 3v4M16 3v4" /><path d="M8.500 13l2.500 2.500 4.500-5" /></Svg>

/** One box: employee ID or phone number signs in an employee; an email signs in HR/admin. */
export default function Login({ onDone }: { onDone: () => void }) {
  const nav = useNavigate()
  const remembered = readRemembered()
  const [ident, setIdent] = useState(remembered)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(!!remembered)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  const isEmail = ident.includes('@')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const id = ident.trim()
      const r = await post<{ token: string; employee: { role: string } }>(
        isEmail ? '/api/auth/login' : '/api/auth/employee-login',
        isEmail ? { email: id, password } : { employeeCode: id, password },
      )
      try { remember ? localStorage.setItem(REMEMBER_KEY, id) : localStorage.removeItem(REMEMBER_KEY) } catch { /* storage unavailable */ }
      setAuth({ kind: 'jwt', token: r.token })
      onDone()
      nav(r.employee.role === 'EMPLOYEE' ? '/' : '/hr')
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
          <span className="lg-logo"><IconCalendar /></span>
          <h1>Attendance<span>Pro</span></h1>
          <p>Smart Attendance Management</p>
        </header>

        <section className="lg-card">
          <h2>Welcome Back <span aria-hidden="true">👋</span></h2>
          <p className="lg-sub">Sign in to your account</p>

          <form onSubmit={submit}>
            <div className="lg-field">
              <span className="lg-ico"><IconUser /></span>
              <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="Employee ID / Phone / Email" aria-label="Employee ID, phone number or email"
                autoCapitalize="none" autoComplete="username" required />
            </div>
            <div className="lg-field">
              <span className="lg-ico"><IconLock /></span>
              <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" aria-label="Password" autoComplete="current-password" required />
              <button type="button" className="lg-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}><IconEye off={!show} /></button>
            </div>

            <div className="lg-row">
              <label className="lg-check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>Remember me</span></label>
              <a href="#" className="lg-link" onClick={e => { e.preventDefault(); setForgot(f => !f) }}>Forgot Password?</a>
            </div>
            {forgot && <div className="lg-note">Ask your HR team to reset your password. They can set a new one from the Employees page.</div>}

            {err && <div className="lg-err" role="alert">{err}</div>}
            <button className="lg-primary" disabled={busy}>{busy ? 'Signing in…' : <>Sign In <IconArrow /></>}</button>
          </form>

          <div className="lg-or"><span>or</span></div>
          <Link to="/punch" className="lg-secondary"><IconFace /> Punch in with your face</Link>
          <p className="lg-foot">Shared office device? <Link to="/kiosk" className="lg-link">Kiosk</Link></p>
        </section>

      </main>
    </div>
  )
}
