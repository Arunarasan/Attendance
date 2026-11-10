import { FormEvent, useState } from 'react'
import { post } from '../../lib/api'
import { Field, Modal, randomPassword } from './ui'

const empty = { employeeCode: '', name: '', email: '', phone: '', password: '', role: 'EMPLOYEE', hourlyRate: '0', baseSalary: '0', attendanceMethod: 'GEO' }

export default function AddEmployeeModal({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [f, setF] = useState(empty)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [touched, setTouched] = useState(false)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })

  const errors: Record<string, string> = {}
  if (!f.employeeCode.trim()) errors.employeeCode = 'Required'
  if (!f.name.trim()) errors.name = 'Required'
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.email = 'Enter a valid email'
  if (f.phone.replace(/\D/g, '').length < 7) errors.phone = 'At least 7 digits'
  if (f.password.length < 8) errors.password = 'At least 8 characters'
  if (Number(f.hourlyRate) < 0 || Number(f.baseSalary) < 0) errors.hourlyRate = 'Pay cannot be negative'
  const show_ = (k: string) => (touched ? errors[k] : undefined)

  async function submit(e: FormEvent) {
    e.preventDefault(); setTouched(true); setErr('')
    if (Object.keys(errors).length) return
    setBusy(true)
    try {
      await post('/api/hr/employees', { ...f, hourlyRate: Number(f.hourlyRate), baseSalary: Number(f.baseSalary) })
      onDone(f.name.trim())
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="panel-head"><h2>Add employee</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>

        <div className="fieldset-title">Identity</div>
        <div className="fgrid">
          <Field label="Name" error={show_('name')}><input className={show_('name') ? 'bad' : ''} value={f.name} onChange={set('name')} autoFocus /></Field>
          <Field label="Employee ID" error={show_('employeeCode')} hint="Used to sign in"><input className={show_('employeeCode') ? 'bad' : ''} value={f.employeeCode} onChange={set('employeeCode')} /></Field>
          <Field label="Email" error={show_('email')}><input type="email" className={show_('email') ? 'bad' : ''} value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone" error={show_('phone')} hint="Used to sign in"><input type="tel" className={show_('phone') ? 'bad' : ''} value={f.phone} onChange={set('phone')} /></Field>
        </div>

        <div className="fieldset-title">Login</div>
        <div className="fgrid">
          <Field label="Password" error={show_('password')} hint="8+ characters" className="full">
            <div className="pw-wrap">
              <input type={show ? 'text' : 'password'} className={show_('password') ? 'bad' : ''} value={f.password} onChange={set('password')} autoComplete="new-password" />
              <button type="button" className="btn ghost" onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</button>
              <button type="button" className="btn ghost" onClick={() => { setF({ ...f, password: randomPassword() }); setShow(true) }}>Generate</button>
            </div>
          </Field>
          <Field label="Role"><select value={f.role} onChange={set('role')}><option>EMPLOYEE</option><option>HR</option><option>ADMIN</option></select></Field>
        </div>

        <div className="fieldset-title">Pay</div>
        <div className="fgrid">
          <Field label="Hourly rate" error={show_('hourlyRate')}><input type="number" min="0" value={f.hourlyRate} onChange={set('hourlyRate')} /></Field>
          <Field label="Monthly base salary"><input type="number" min="0" value={f.baseSalary} onChange={set('baseSalary')} /></Field>
        </div>

        <div className="fieldset-title">Attendance</div>
        <Field label="Punch method"><select value={f.attendanceMethod} onChange={set('attendanceMethod')}><option value="GEO">Phone + location</option><option value="OFFICE_DEVICE">Office kiosk</option><option value="ANY">Either</option></select></Field>

        {err && <div className="err">{err}</div>}
        <div className="actions"><button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add employee'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  )
}
