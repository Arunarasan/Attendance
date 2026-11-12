import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { blobUrl, del, fmtDateTime, fmtHours, fmtTime, get, post, put, today } from '../lib/api'
import type { Me } from '../App'
import EmployeesTab from './employees/EmployeesTab'
import Dashboard from './Dashboard'
import { Holidays, LeaveAdmin } from './LeaveHolidays'
import { Corrections, Register } from './AttendanceAdmin'
import { Approvals, PhotoRequests, WeekOffRequests } from './ApprovalsAdmin'
import { Locations, Networks } from './LocationsAdmin'
import { AppInfo, GeneralSettings, LanguageSettings, LopReview, PaySettings, Payroll, Scores } from './PayAdmin'
import { ICal, ICalCheck, ICheckSq, IBell, IDevice, IGear, IHome, IMenu, IPin, IUsers, IWallet, Leaves } from '../components/icons'
import { useT } from '../lib/i18n'
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
    <form className="row" onSubmit={create}><input aria-label="Kiosk name" placeholder="Kiosk name" value={name} onChange={e => setName(e.target.value)} required style={{ maxWidth: 260 }} /><button className="btn">Create</button></form>
    {code && <p>Pairing code: <span className="code">{code}</span></p>}
    <table><thead><tr><th>Name</th><th>Paired</th><th>Active</th><th></th></tr></thead>
      <tbody>{data?.map(k => <tr key={k.id}><td>{k.name}</td><td>{k.paired ? 'yes' : 'no'}</td><td>{k.active ? 'yes' : 'no'}</td>
        <td className="row">{k.active && <button className="btn ghost" onClick={() => re(k.id)}>New code</button>}{k.active && <button className="btn ghost" onClick={async () => { await del(`/api/hr/kiosks/${k.id}`); reload() }}>Deactivate</button>}</td></tr>)}</tbody></table></div>)
}

const TABS: Record<string, () => JSX.Element> = {
  approve: Approvals, photo: PhotoRequests, weekoff: WeekOffRequests, register: Register, loc: Locations, net: Networks, fix: Corrections, phones: Phones,
  kiosks: Kiosks, leave: LeaveAdmin, holidays: Holidays, pay: Payroll, lop: LopReview, score: Scores, paycfg: PaySettings, gen: GeneralSettings, info: AppInfo, lang: LanguageSettings,
}

type Group = { key: string; label: string; icon: ReactNode; tabs: [string, string][] }
/** Labels are translation keys, looked up when drawn. */
const GROUPS: Group[] = [
  { key: 'dash', label: 'h_dashboard', icon: <IHome />, tabs: [] },
  { key: 'emps', label: 'h_employees', icon: <IUsers />, tabs: [] },
  { key: 'att', label: 'h_attendance', icon: <ICalCheck />, tabs: [['register', 'h_tabRegister'], ['fix', 'h_tabCorrections']] },
  { key: 'leave', label: 'h_leaveHol', icon: <ICal />, tabs: [['leave', 'h_tabLeave'], ['holidays', 'h_tabHolidays']] },
  { key: 'appr', label: 'h_approvals', icon: <ICheckSq />, tabs: [['approve', 'h_tabToApprove'], ['photo', 'h_tabPhoto'], ['weekoff', 'h_tabWeekly']] },
  { key: 'loc', label: 'h_locations', icon: <IPin />, tabs: [['loc', 'h_tabLocations'], ['net', 'h_tabWifi']] },
  { key: 'dev', label: 'h_devices', icon: <IDevice />, tabs: [['phones', 'h_tabPhones'], ['kiosks', 'h_tabKiosks']] },
  { key: 'pay', label: 'h_payroll', icon: <IWallet />, tabs: [['pay', 'h_tabPayroll'], ['lop', 'h_tabLop'], ['score', 'h_tabScores'], ['paycfg', 'h_tabPaySettings']] },
  { key: 'set', label: 'h_settings', icon: <IGear />, tabs: [['gen', 'h_tabGeneral'], ['lang', 'h_tabLanguage'], ['info', 'h_tabAppInfo']] },
]
const groupOf = (tab: string) => GROUPS.find(g => g.key === tab || g.tabs.some(t => t[0] === tab)) ?? GROUPS[0]

export default function Hr({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { t } = useT()
  const [tab, setTab] = useState('dash')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(0)
  useEffect(() => { get<{ count: number }>('/api/hr/attendance/pending/count').then(r => setPending(r.count)).catch(() => {}) }, [tab])
  const go = (t: string) => { setTab(t); setOpen(false) }
  const group = groupOf(tab)
  const Cur = TABS[tab]
  const hour = new Date().getHours()
  const hello = hour < 12 ? t('morning') : hour < 17 ? t('afternoon') : t('evening')
  const first = me.name.split(' ')[0]
  const initials = me.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const title = tab === 'dash' ? <>{hello}, {first} <span aria-hidden="true">👋</span></> : t(group.label)
  const sub = tab === 'dash' ? t('h_overview') : t('h_manage')
  return (
    <div className={`hx${open ? ' open' : ''}`}>
      <aside className="hx-side">
        <div className="hx-brand"><span className="hx-logo"><img src="/logo.webp" alt="Arudra Attender" /></span><small>{me.role === 'ADMIN' ? t('h_adminPortal') : t('h_hrPortal')}</small></div>
        <nav className="hx-nav">
          {GROUPS.map(g => (
            <button key={g.key} className={group.key === g.key ? 'on' : ''} onClick={() => go(g.tabs[0]?.[0] ?? g.key)}>
              {g.icon}{t(g.label)}{g.key === 'appr' && pending > 0 && <span className="badge">{pending}</span>}
            </button>))}
        </nav>
        <Leaves className="hx-leaves" />
      </aside>
      <div className="hx-scrim" onClick={() => setOpen(false)} />
      <div className="hx-main">
        <header className="hx-top">
          <button className="hx-burger" onClick={() => setOpen(true)} aria-label="Open menu"><IMenu /></button>
          <div className="hx-hello"><h1>{title}</h1><p>{sub}</p></div>
          <button className="hx-bell" onClick={() => go('approve')} aria-label={`${pending} pending approvals`}><IBell />{pending > 0 && <i>{pending}</i>}</button>
          <div className="hx-user"><span className="av">{initials}</span><span><b>{me.name}</b><small>{me.role === 'ADMIN' ? t('h_admin') : t('h_hr')}</small></span><button onClick={onLogout}>{t('signOut')}</button></div>
        </header>
        <div className="hx-body">
          {group.tabs.length > 1 && <div className="tabs">{group.tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>}
          {tab === 'dash' ? <Dashboard go={go} /> : tab === 'emps' ? <EmployeesTab meId={me.id} /> : Cur ? <Cur /> : null}
        </div>
      </div>
    </div>
  )
}
