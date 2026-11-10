import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { blobUrl, del, fmtDateTime, fmtHours, fmtTime, get, post, put, today } from '../lib/api'
import type { Me } from '../App'
import EmployeesTab from './employees/EmployeesTab'
import Dashboard from './Dashboard'
import { Holidays, LeaveAdmin } from './LeaveHolidays'
import { Corrections, Register } from './AttendanceAdmin'
import { Approvals, PhotoRequests } from './ApprovalsAdmin'
import { Locations, Networks } from './LocationsAdmin'
import { LopReview, PaySettings, Payroll, Scores } from './PayAdmin'
import { ICal, ICalCheck, ICheckSq, IBell, IDevice, IGear, IHome, IMenu, IPin, IUsers, IWallet, Leaves } from '../components/icons'
import './hr.css'

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path, ...deps])
  return { data, err, reload }
}

function Phones() {
  const { data, reload } = useLoad<any[]>('/api/hr/attendance/devices')
  const emps = useLoad<any[]>('/api/hr/employees').data
  const name = (id: number) => emps?.find(e => e.id === id)?.name ?? id
  const act = async (id: number, a: string) => { await post(`/api/hr/attendance/devices/${id}/${a}`); reload() }
  return (<div className="card"><h2>Registered phones</h2>
    <p className="muted">One approved phone per employee. Approving a pending phone replaces the old one.</p>
    <table><thead><tr><th>Employee</th><th>Phone</th><th>Status</th><th>Added</th><th></th></tr></thead>
      <tbody>{data?.map(d => <tr key={d.id}><td>{name(d.employeeId)}</td><td>{d.label}</td><td><span className={`pill ${d.status === 'PENDING' ? 'warn' : 'ok'}`}>{d.status.toLowerCase()}</span></td><td>{fmtDateTime(d.createdAt)}</td>
        <td className="row">{d.status === 'PENDING' && <button className="btn" onClick={() => act(d.id, 'approve')}>Approve</button>}<button className="btn ghost" onClick={() => act(d.id, 'revoke')}>Revoke</button></td></tr>)}</tbody></table></div>)
}

function Kiosks() {
  const { data, reload } = useLoad<any[]>('/api/hr/kiosks')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const create = async (e: FormEvent) => { e.preventDefault(); const r = await post('/api/hr/kiosks', { name }); setCode(r.code); setName(''); reload() }
  const re = async (id: number) => { const r = await post(`/api/hr/kiosks/${id}/pair-code`); setCode(r.code) }
  return (<div className="card"><h2>Office kiosks</h2>
    <p className="muted">On the shared phone or PC open <b>/kiosk</b> and enter the code (valid 24 h, single use). Re-pairing replaces the old device.</p>
    <form className="row" onSubmit={create}><input placeholder="Kiosk name" value={name} onChange={e => setName(e.target.value)} required style={{ maxWidth: 260 }} /><button className="btn">Create</button></form>
    {code && <p>Pairing code: <span className="code">{code}</span></p>}
    <table><thead><tr><th>Name</th><th>Paired</th><th>Active</th><th></th></tr></thead>
      <tbody>{data?.map(k => <tr key={k.id}><td>{k.name}</td><td>{k.paired ? 'yes' : 'no'}</td><td>{k.active ? 'yes' : 'no'}</td>
        <td className="row">{k.active && <button className="btn ghost" onClick={() => re(k.id)}>New code</button>}{k.active && <button className="btn ghost" onClick={async () => { await del(`/api/hr/kiosks/${k.id}`); reload() }}>Deactivate</button>}</td></tr>)}</tbody></table></div>)
}

const TABS: Record<string, () => JSX.Element> = {
  approve: Approvals, photo: PhotoRequests, register: Register, loc: Locations, net: Networks, fix: Corrections, phones: Phones,
  kiosks: Kiosks, leave: LeaveAdmin, holidays: Holidays, pay: Payroll, lop: LopReview, score: Scores, paycfg: PaySettings,
}

type Group = { key: string; label: string; icon: ReactNode; tabs: [string, string][] }
const GROUPS: Group[] = [
  { key: 'dash', label: 'Dashboard', icon: <IHome />, tabs: [] },
  { key: 'emps', label: 'Employees', icon: <IUsers />, tabs: [] },
  { key: 'att', label: 'Attendance', icon: <ICalCheck />, tabs: [['register', 'Register'], ['fix', 'Corrections']] },
  { key: 'leave', label: 'Leave & Holidays', icon: <ICal />, tabs: [['leave', 'Leave'], ['holidays', 'Holidays']] },
  { key: 'appr', label: 'Approvals', icon: <ICheckSq />, tabs: [['approve', 'To approve'], ['photo', 'Photo requests']] },
  { key: 'loc', label: 'Locations', icon: <IPin />, tabs: [['loc', 'Locations'], ['net', 'WiFi']] },
  { key: 'dev', label: 'Devices / Kiosks', icon: <IDevice />, tabs: [['phones', 'Phones'], ['kiosks', 'Kiosks']] },
  { key: 'pay', label: 'Payroll', icon: <IWallet />, tabs: [['pay', 'Payroll'], ['lop', 'Loss of pay review'], ['score', 'Honour scores']] },
  { key: 'set', label: 'Settings', icon: <IGear />, tabs: [['paycfg', 'Pay settings']] },
]
const groupOf = (tab: string) => GROUPS.find(g => g.key === tab || g.tabs.some(t => t[0] === tab)) ?? GROUPS[0]

export default function Hr({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState('dash')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(0)
  useEffect(() => { get<{ count: number }>('/api/hr/attendance/pending/count').then(r => setPending(r.count)).catch(() => {}) }, [tab])
  const go = (t: string) => { setTab(t); setOpen(false) }
  const group = groupOf(tab)
  const Cur = TABS[tab]
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const first = me.name.split(' ')[0]
  const initials = me.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const title = tab === 'dash' ? <>{hello}, {first} <span aria-hidden="true">👋</span></> : group.label
  const sub = tab === 'dash' ? "Here's your organization overview for today." : 'Manage ' + group.label.toLowerCase() + ' for your organization.'
  return (
    <div className={`hx${open ? ' open' : ''}`}>
      <aside className="hx-side">
        <div className="hx-brand"><span className="logo"><ICalCheck /></span><h1>Attendance<span>Pro</span></h1></div>
        <nav className="hx-nav">
          {GROUPS.map(g => (
            <button key={g.key} className={group.key === g.key ? 'on' : ''} onClick={() => go(g.tabs[0]?.[0] ?? g.key)}>
              {g.icon}{g.label}{g.key === 'appr' && pending > 0 && <span className="badge">{pending}</span>}
            </button>))}
        </nav>
        <Leaves className="hx-leaves" />
      </aside>
      <div className="hx-scrim" onClick={() => setOpen(false)} />
      <div className="hx-main">
        <header className="hx-top">
          <button className="hx-burger" onClick={() => setOpen(true)} aria-label="Open menu"><IMenu /></button>
          <div className="hx-hello"><h2>{title}</h2><p>{sub}</p></div>
          <button className="hx-bell" onClick={() => go('approve')} aria-label={`${pending} pending approvals`}><IBell />{pending > 0 && <i>{pending}</i>}</button>
          <div className="hx-user"><span className="av">{initials}</span><span><b>{me.name}</b><small>{me.role === 'ADMIN' ? 'Admin' : 'HR'}</small></span><button onClick={onLogout}>Sign out</button></div>
        </header>
        <div className="hx-body">
          {group.tabs.length > 1 && <div className="tabs">{group.tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}
          {tab === 'dash' ? <Dashboard go={go} /> : tab === 'emps' ? <EmployeesTab meId={me.id} /> : Cur ? <Cur /> : null}
        </div>
      </div>
    </div>
  )
}
