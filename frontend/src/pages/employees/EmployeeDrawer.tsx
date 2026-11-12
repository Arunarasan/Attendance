import { useState } from 'react'
import { del, post, put } from '../../lib/api'
import FaceEnrol from '../FaceEnrol'
import EmpPayExtras from './EmpPayExtras'
import EmpOffDays from './EmpOffDays'
import { BINDING_LABEL, Confirm, copyText, Drawer, Emp, Field, initials, METHOD_LABEL, Modal, randomPassword } from './ui'

type Tab = 'profile' | 'pay' | 'access'

export default function EmployeeDrawer({ emp, meId, onClose, onChanged, toast }:
  { emp: Emp; meId: number; onClose: () => void; onChanged: () => void; toast: (t: string, bad?: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('profile')
  const self = emp.id === meId
  const [p, setP] = useState({
    name: emp.name, employeeCode: emp.employeeCode, email: emp.email ?? '', phone: emp.phone ?? '', role: emp.role,
    attendanceMethod: emp.attendanceMethod, deviceBindingMode: emp.deviceBindingMode ?? '',
    hourlyRate: String(emp.hourlyRate ?? 0), baseSalary: String(emp.baseSalary ?? 0),
  })
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // For people who leave or withdraw consent: deletes face templates and photos. Hours and pay are kept.
  const removeFace = async () => {
    if (!window.confirm(`Remove all face data for ${emp.name}? They will no longer be recognised by face. Their hours and pay are not affected. This cannot be undone.`)) return
    try { await del(`/api/hr/employees/${emp.id}/face`); toast(`Face data removed for ${emp.name}`); onChanged() } catch (e: any) { toast(e.message, true) }
  }
  const [code, setCode] = useState<{ code: string; at: number } | null>(null)
  const [confirm, setConfirm] = useState<'deactivate' | 'revoke' | 'reactivate' | null>(null)
  const [enrol, setEnrol] = useState(false)
  const [leaveAsk, setLeaveAsk] = useState(false)
  const set = (k: string) => (e: any) => setP({ ...p, [k]: e.target.value })

  const dirty = (Object.keys(p) as (keyof typeof p)[]).some(k => p[k] !== ({
    name: emp.name, employeeCode: emp.employeeCode, email: emp.email ?? '', phone: emp.phone ?? '', role: emp.role,
    attendanceMethod: emp.attendanceMethod, deviceBindingMode: emp.deviceBindingMode ?? '',
    hourlyRate: String(emp.hourlyRate ?? 0), baseSalary: String(emp.baseSalary ?? 0),
  })[k]) || pw !== ''
  const idChanged = p.employeeCode.trim() !== emp.employeeCode || p.email.trim().toLowerCase() !== (emp.email ?? '').toLowerCase() || p.phone.replace(/\D/g, '') !== (emp.phone ?? '').replace(/\D/g, '')

  const errors: Record<string, string> = {}
  if (!p.name.trim()) errors.name = 'Required'
  if (!p.employeeCode.trim()) errors.employeeCode = 'Required'
  if (!/^\S+@\S+\.\S+$/.test(p.email.trim())) errors.email = 'Enter a valid email'
  if (p.phone && p.phone.replace(/\D/g, '').length < 7) errors.phone = 'At least 7 digits'
  if (Number(p.hourlyRate) < 0) errors.hourlyRate = 'Cannot be negative'
  if (Number(p.baseSalary) < 0) errors.baseSalary = 'Cannot be negative'
  if (pw && pw.length < 8) errors.password = 'At least 8 characters'

  const close = () => { if (dirty) setLeaveAsk(true); else onClose() }

  async function save() {
    setErr('')
    if (Object.keys(errors).length) { setErr('Fix the highlighted fields first'); return }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        name: p.name.trim(), employeeCode: p.employeeCode.trim(), email: p.email.trim(), phone: p.phone,
        role: p.role, attendanceMethod: p.attendanceMethod,
        hourlyRate: Number(p.hourlyRate), baseSalary: Number(p.baseSalary),
      }
      if (p.deviceBindingMode) body.deviceBindingMode = p.deviceBindingMode
      if (pw) body.password = pw
      await put(`/api/hr/employees/${emp.id}`, body)
      setPw(''); toast(`Saved ${p.name.trim()}`); onChanged(); onClose()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function setActive(active: boolean) {
    setConfirm(null)
    try { await put(`/api/hr/employees/${emp.id}`, { active }); toast(active ? `${emp.name} reactivated` : `${emp.name} deactivated`); onChanged(); onClose() }
    catch (e: any) { toast(e.message, true) }
  }
  async function makeCode() {
    try { const r = await post(`/api/hr/employees/${emp.id}/app-code`); setCode({ code: r.code, at: Date.now() }); onChanged() } catch (e: any) { toast(e.message, true) }
  }
  async function revoke() {
    setConfirm(null)
    try { await post(`/api/hr/employees/${emp.id}/app-revoke`); toast('App access revoked'); onChanged() } catch (e: any) { toast(e.message, true) }
  }

  return (<>
    <Drawer onClose={close}>
      <div className="panel-head">
        <div className="who"><span className={`avatar${emp.active ? '' : ' off'}`}>{initials(emp.name)}</span>
          <div><b>{emp.name}</b><span className="muted">{emp.employeeCode} · {emp.role.toLowerCase()}{!emp.active && ' · inactive'}{self && ' · you'}</span></div></div>
        <button className="btn ghost" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="subtabs">
        {(['profile', 'pay', 'access'] as Tab[]).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'profile' ? 'Profile' : t === 'pay' ? 'Pay' : 'Access'}</button>)}
      </div>

      {tab === 'profile' && <div className="fgrid">
        <Field label="Name" error={errors.name} className="full"><input className={errors.name ? 'bad' : ''} value={p.name} onChange={set('name')} /></Field>
        <Field label="Employee ID" error={errors.employeeCode}><input className={errors.employeeCode ? 'bad' : ''} value={p.employeeCode} onChange={set('employeeCode')} /></Field>
        <Field label="Phone" error={errors.phone}><input type="tel" className={errors.phone ? 'bad' : ''} value={p.phone} onChange={set('phone')} /></Field>
        <Field label="Email" error={errors.email} className="full"><input type="email" className={errors.email ? 'bad' : ''} value={p.email} onChange={set('email')} /></Field>
        {idChanged && <div className="hint full">Employee ID, email and phone are part of the sign-in. Tell {emp.name.split(' ')[0]} if you change them.</div>}
        <Field label="Role" hint={self ? 'You cannot change your own role' : undefined}>
          <select value={p.role} onChange={set('role')} disabled={self}><option>EMPLOYEE</option><option>HR</option><option>ADMIN</option></select></Field>
        <Field label="Punch method"><select value={p.attendanceMethod} onChange={set('attendanceMethod')}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Phone binding" hint="Locks punches to one approved phone"><select value={p.deviceBindingMode} onChange={set('deviceBindingMode')}>
          <option value="">Company default</option>{Object.entries(BINDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>}

      {tab === 'pay' && <div className="fgrid">
        <Field label="Hourly rate" error={errors.hourlyRate}><input type="number" min="0" value={p.hourlyRate} onChange={set('hourlyRate')} /></Field>
        <Field label="Monthly base salary" error={errors.baseSalary}><input type="number" min="0" value={p.baseSalary} onChange={set('baseSalary')} /></Field>
        <div className="hint full">Rate changes apply to payroll runs generated after you save. Existing payslips are not changed.</div>
        <EmpPayExtras empId={emp.id} toast={toast} />
        <EmpOffDays empId={emp.id} toast={toast} />
      </div>}

      {tab === 'access' && <>
        <Field label="Reset password" error={errors.password} hint="Leave blank to keep the current password. Click Save changes to apply.">
          <div className="pw-wrap">
            <input type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" aria-label="Reset password" placeholder="New password" />
            <button type="button" className="btn ghost" onClick={() => setShowPw(s => !s)}>{showPw ? 'Hide' : 'Show'}</button>
            <button type="button" className="btn ghost" onClick={() => { setPw(randomPassword()); setShowPw(true) }}>Generate</button>
          </div>
        </Field>
        <div className="action-row"><div><b>Face</b><div className="muted">{emp.faceEnrolled ? 'Enrolled' : 'Not enrolled'}</div></div>
          <div className="row"><button className="btn ghost" onClick={() => setEnrol(true)}>{emp.faceEnrolled ? 'Re-enrol face' : 'Enrol face'}</button>
            {emp.faceEnrolled && <button className="btn ghost" onClick={removeFace}>Remove face data</button>}</div></div>
        <div className="action-row"><div><b>Mobile app</b><div className="muted">{emp.appPaired ? 'Paired' : 'Not paired'}</div>
          {code && <div style={{ marginTop: 8 }}><span className="code">{code.code}</span><div className="hint">Valid 24 hours, single use.</div></div>}</div>
          <div className="row">
            {code && <button className="btn ghost" onClick={async () => toast((await copyText(code.code)) ? 'Code copied' : 'Copy failed. Select the code and copy it.', false)}>Copy</button>}
            <button className="btn ghost" onClick={makeCode}>{code ? 'New code' : 'Pairing code'}</button>
            {emp.appPaired && <button className="btn ghost" onClick={() => setConfirm('revoke')}>Revoke</button>}</div></div>
        <div className="action-row"><div><b>Approved phone</b><div className="muted">{emp.phoneApproved ? 'One phone approved' : 'None approved'}</div></div><span className="muted hint">Manage in the Phones tab</span></div>
        <div className="danger-zone"><div className="action-row">
          <div><b>{emp.active ? 'Deactivate employee' : 'Reactivate employee'}</b><div className="muted">{self ? 'You cannot deactivate your own account' : emp.active ? 'Blocks sign-in and punching. History is kept.' : 'Allows sign-in and punching again.'}</div></div>
          <button className={`btn${emp.active ? ' danger' : ' ghost'}`} disabled={self && emp.active} onClick={() => setConfirm(emp.active ? 'deactivate' : 'reactivate')}>{emp.active ? 'Deactivate' : 'Reactivate'}</button></div></div>
      </>}

      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button><button className="btn ghost" onClick={close}>Cancel</button></div>
    </Drawer>

    {enrol && <Modal onClose={() => setEnrol(false)}><FaceEnrol employee={{ id: emp.id, name: emp.name }} onClose={() => { setEnrol(false); onChanged() }} /></Modal>}
    {confirm === 'deactivate' && <Confirm title={`Deactivate ${emp.name}?`} body="They will no longer be able to sign in or punch. Their history stays." confirmLabel="Deactivate" danger onYes={() => setActive(false)} onNo={() => setConfirm(null)} />}
    {confirm === 'reactivate' && <Confirm title={`Reactivate ${emp.name}?`} body="They will be able to sign in and punch again." confirmLabel="Reactivate" onYes={() => setActive(true)} onNo={() => setConfirm(null)} />}
    {confirm === 'revoke' && <Confirm title="Revoke app access?" body={`${emp.name} will be signed out of the mobile app and need a new pairing code.`} confirmLabel="Revoke" danger onYes={revoke} onNo={() => setConfirm(null)} />}
    {leaveAsk && <Confirm title="Discard changes?" body="You have unsaved changes." confirmLabel="Discard" danger onYes={onClose} onNo={() => setLeaveAsk(false)} />}
  </>)
}
