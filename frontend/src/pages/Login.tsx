import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { post, setAuth } from '../lib/api'

/** Employees sign in with employee ID + phone number + password. HR and admin can use email + password. */
export default function Login({ onDone }: { onDone: () => void }) {
  const nav = useNavigate()
  const [staff, setStaff] = useState(false) // false = employee login, true = HR / admin
  const [employeeCode, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const r = await post<{ token: string; employee: { role: string } }>(
        staff ? '/api/auth/login' : '/api/auth/employee-login',
        staff ? { email, password } : { employeeCode, phone, password },
      )
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
    <div className="wrap narrow">
      <div className="card">
        <h2>Sign in</h2>
        <form onSubmit={submit}>
          {staff ? (
            <>
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
            </>
          ) : (
            <>
              <label>Employee ID</label>
              <input value={employeeCode} onChange={e => setCode(e.target.value)} autoCapitalize="characters" autoComplete="username" required />
              <label>Phone number</label>
              <input type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" required />
            </>
          )}
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          {err && <div className="err">{err}</div>}
          <p><button className="btn big" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></p>
        </form>
        <p className="muted">
          <a href="#" onClick={e => { e.preventDefault(); setStaff(!staff); setErr('') }}>{staff ? 'Employee sign in' : 'HR / admin sign in'}</a>
          {' · '}Shared office device? <Link to="/kiosk">Kiosk</Link>
        </p>
      </div>
    </div>
  )
}
