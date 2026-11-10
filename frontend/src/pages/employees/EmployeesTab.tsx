import { useEffect, useMemo, useState } from 'react'
import { get } from '../../lib/api'
import AddEmployeeModal from './AddEmployeeModal'
import EmployeeDrawer from './EmployeeDrawer'
import { Emp, initials, METHOD_LABEL, useToasts } from './ui'

type SortKey = 'name' | 'employeeCode' | 'role' | 'attendanceMethod'
type Status = 'ALL' | 'ACTIVE' | 'INACTIVE'

export default function EmployeesTab({ meId }: { meId: number }) {
  const [data, setData] = useState<Emp[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [q, setQ] = useState('')
  const [role, setRole] = useState('ALL')
  const [method, setMethod] = useState('ALL')
  const [status, setStatus] = useState<Status>('ACTIVE')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [selId, setSelId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const { push, view } = useToasts()

  const reload = () => get<Emp[]>('/api/hr/employees').then(d => { setData(d); setLoadErr('') }).catch(e => setLoadErr(e.message))
  useEffect(() => { reload() }, [])

  const active = data?.filter(e => e.active).length ?? 0
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return (data ?? [])
      .filter(e => status === 'ALL' || (status === 'ACTIVE') === e.active)
      .filter(e => role === 'ALL' || e.role === role)
      .filter(e => method === 'ALL' || e.attendanceMethod === method)
      .filter(e => !s || e.name.toLowerCase().includes(s) || e.employeeCode.toLowerCase().includes(s) || e.email.toLowerCase().includes(s) || (digits.length >= 3 && e.phone.includes(digits)))
      .sort((a, b) => a[sort.key].localeCompare(b[sort.key], undefined, { sensitivity: 'base' }) * sort.dir)
  }, [data, q, role, method, status, sort])

  const sel = data?.find(e => e.id === selId) ?? null
  const th = (key: SortKey, label: string) => (
    <th className="sortable" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>)
  const dots = (e: Emp) => <span className="dots"><span className={`dot${e.faceEnrolled ? ' on' : ''}`} title={e.faceEnrolled ? 'Face enrolled' : 'No face enrolled'}>Face</span><span className={`dot${e.appPaired ? ' on' : ''}`} title={e.appPaired ? 'App paired' : 'App not paired'}>App</span><span className={`dot${e.phoneApproved ? ' on' : ''}`} title={e.phoneApproved ? 'Phone approved' : 'No approved phone'}>Phone</span></span>

  return (<>
    <div className="card">
      <div className="emp-head">
        <div><h2>Employees</h2><div className="sub">{data ? `${active} active · ${data.length - active} inactive` : 'Loading…'}</div></div>
        <button className="btn" onClick={() => setAdding(true)}>+ Add employee</button>
      </div>
      <div className="toolbar">
        <input type="search" placeholder="Search name, ID, email or phone" value={q} onChange={e => setQ(e.target.value)} aria-label="Search employees" />
        <select value={role} onChange={e => setRole(e.target.value)} aria-label="Role"><option value="ALL">All roles</option><option>EMPLOYEE</option><option>HR</option><option>ADMIN</option></select>
        <select value={method} onChange={e => setMethod(e.target.value)} aria-label="Punch method"><option value="ALL">All methods</option>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <div className="chips">{(['ACTIVE', 'INACTIVE', 'ALL'] as Status[]).map(s => <button key={s} className={`chip${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>{s === 'ALL' ? 'All' : s === 'ACTIVE' ? 'Active' : 'Inactive'}</button>)}</div>
      </div>
      {loadErr && <div className="err">{loadErr}</div>}

      {data && rows.length === 0 && <div className="empty">{data.length === 0 ? 'No employees yet. Add the first one.' : 'No employees match these filters.'}</div>}

      {rows.length > 0 && <>
        <div className="scroll"><table className="emp-table">
          <thead><tr>{th('name', 'Employee')}{th('employeeCode', 'ID')}{th('role', 'Role')}{th('attendanceMethod', 'Method')}<th>Status</th></tr></thead>
          <tbody>{rows.map(e => <tr key={e.id} className={e.active ? '' : 'off'} onClick={() => setSelId(e.id)} tabIndex={0} onKeyDown={k => { if (k.key === 'Enter') setSelId(e.id) }}>
            <td><div className="who"><span className={`avatar${e.active ? '' : ' off'}`}>{initials(e.name)}</span><div><b>{e.name}{e.id === meId && <span className="muted"> (you)</span>}</b><span className="muted">{e.email}</span></div></div></td>
            <td>{e.employeeCode}</td><td><span className={`pill role-${e.role}`}>{e.role.toLowerCase()}</span></td><td>{METHOD_LABEL[e.attendanceMethod] ?? e.attendanceMethod}</td>
            <td>{e.active ? dots(e) : <span className="pill warn">inactive</span>}</td></tr>)}</tbody></table></div>
        <div className="emp-cards">{rows.map(e => <div key={e.id} className={`emp-card${e.active ? '' : ' off'}`} onClick={() => setSelId(e.id)}>
          <div className="who"><span className={`avatar${e.active ? '' : ' off'}`}>{initials(e.name)}</span><div><b>{e.name}</b><span className="muted">{e.employeeCode} · {e.role.toLowerCase()}</span></div></div>
          {e.active ? dots(e) : <span className="pill warn">inactive</span>}</div>)}</div>
      </>}
    </div>

    {sel && <EmployeeDrawer key={sel.id} emp={sel} meId={meId} onClose={() => setSelId(null)} onChanged={reload} toast={push} />}
    {adding && <AddEmployeeModal onClose={() => setAdding(false)} onDone={name => { setAdding(false); push(`Added ${name}`); reload() }} />}
    {view}
  </>)
}
