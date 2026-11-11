import { FormEvent, useEffect, useMemo, useState } from 'react'
import { del, fmtDateTime, get, post, put, today } from '../lib/api'
import { LANGS, setLang, useT } from '../lib/i18n'
import { IAlert, ICal, ICheckCircle, IClock, IWallet, IUsers } from '../components/icons'
import './leaveHolidays.css'
import './attendanceAdmin.css'
import './approvalsAdmin.css'
import './locationsAdmin.css'
import './payAdmin.css'

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path, ...deps])
  return { data, err, reload }
}
const initials = (name: string) => (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
const money = (v: any) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DAYS: [string, string][] = [['MONDAY', 'Mon'], ['TUESDAY', 'Tue'], ['WEDNESDAY', 'Wed'], ['THURSDAY', 'Thu'], ['FRIDAY', 'Fri'], ['SATURDAY', 'Sat'], ['SUNDAY', 'Sun']]
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

function Card({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>{right}</div>
      {children}
    </section>
  )
}
function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button type="button" className={`lh-tg${on ? ' on' : ''}`} onClick={onClick}><i />{label}</button>
}
function Num({ label, value, onChange, unit, min = 0, max, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <div className="pa-num"><label>{label}</label>
      <div><input type="number" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />{unit && <em>{unit}</em>}</div>
      {hint && <small>{hint}</small>}</div>
  )
}

/* ============ Pay settings ============ */

type Pol = {
  workingDaysBasis: string; otAfterMinutes: number; otDailyCapMinutes: number; lopEnabled: boolean; graceMinutes: number; halfDayMinMinutes: number
  shiftStart: string; lateGraceMinutes: number; lateCountForHalfDay: number; wAttendance: number; wPunctuality: number; wHours: number; wDiscipline: number
  bonusMinScore: number; bonusAmount: number; shortfallMethod: 'DAYS' | 'HOURS'; freeOffDays: number
}

export function PaySettings() {
  const stL = useLoad<any>('/api/hr/settings')
  const polL = useLoad<Pol>('/api/hr/policy')
  const [st, setSt] = useState<any>(null)
  const [pol, setPol] = useState<Pol | null>(null)
  const [saved, setSaved] = useState('')
  const [sec, setSec] = useState<'pay' | 'time' | 'lop' | 'score' | 'ded'>('pay')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { if (stL.data) setSt({ ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) }); setSaved('') }, [stL.data])
  useEffect(() => { if (polL.data) { const p = { ...polL.data, shiftStart: String(polL.data.shiftStart).slice(0, 5), bonusAmount: Number(polL.data.bonusAmount) }; setPol(p) } }, [polL.data])
  const snap = (s: any, p: any) => JSON.stringify([s, p])
  const orig = useMemo(() => (stL.data && polL.data ? snap({ ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) }, { ...polL.data, shiftStart: String(polL.data.shiftStart).slice(0, 5), bonusAmount: Number(polL.data.bonusAmount) }) : ''), [stL.data, polL.data])
  const dirty = !!(st && pol) && snap(st, pol) !== orig && saved !== snap(st, pol)

  async function save() {
    setErr(''); setMsg('')
    try {
      await put('/api/hr/settings', { standardDailyHours: Number(st.standardDailyHours), weeklyOffDays: st.weeklyOffDays, overtimeMultiplier: Number(st.overtimeMultiplier), defaultMode: st.defaultMode })
      await put('/api/hr/policy', { ...pol, shiftStart: pol!.shiftStart.length === 5 ? pol!.shiftStart + ':00' : pol!.shiftStart })
      setMsg('Saved. New rules apply to payroll runs generated from now on.'); setSaved(snap(st, pol)); stL.reload(); polL.reload()
    } catch (e: any) { setErr(e.message) }
  }
  const discard = () => { setSt({ ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) }); setPol({ ...polL.data!, shiftStart: String(polL.data!.shiftStart).slice(0, 5), bonusAmount: Number(polL.data!.bonusAmount) }) }

  if (!st || !pol) return <div className="lh-sec muted">Loading…</div>
  const P = (patch: Partial<Pol>) => setPol({ ...pol, ...patch })
  const std = Number(st.standardDailyHours) * 60
  const lateAfter = (() => { const [h, m] = pol.shiftStart.split(':').map(Number); const t = h * 60 + m + pol.lateGraceMinutes; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` })()
  const wsum = pol.wAttendance + pol.wPunctuality + pol.wHours + pol.wDiscipline
  const off: string[] = st.weeklyOffDays

  const st0: any = stL.data ? { ...stL.data, overtimeMultiplier: Number(stL.data.overtimeMultiplier) } : {}
  const pol0: any = polL.data ?? {}
  const diff = (sk: string[], pk: string[]) => sk.some(k => JSON.stringify(st[k]) !== JSON.stringify(st0[k])) || pk.some(k => JSON.stringify((pol as any)[k]) !== JSON.stringify(k === 'shiftStart' ? String(pol0[k]).slice(0, 5) : k === 'bonusAmount' ? Number(pol0[k]) : pol0[k]))
  const SECTIONS: { key: typeof sec; label: string; hint: string; icon: React.ReactNode; dirty: boolean }[] = [
    { key: 'pay', label: 'Pay & overtime', hint: pol.shortfallMethod === 'HOURS' ? 'Paid by hours' : 'Mode, divisor, overtime', icon: <IWallet size={20} />, dirty: diff(['defaultMode', 'overtimeMultiplier'], ['workingDaysBasis', 'otAfterMinutes', 'otDailyCapMinutes', 'shortfallMethod', 'freeOffDays']) },
    { key: 'time', label: 'Work time', hint: 'Hours and weekly off', icon: <IClock size={20} />, dirty: diff(['standardDailyHours', 'weeklyOffDays'], []) },
    { key: 'lop', label: 'Loss of pay', hint: pol.lopEnabled ? 'Rules on' : 'Rules off', icon: <IAlert size={20} />, dirty: diff([], ['lopEnabled', 'graceMinutes', 'halfDayMinMinutes', 'shiftStart', 'lateGraceMinutes', 'lateCountForHalfDay']) },
    { key: 'score', label: 'Honour score', hint: 'Weights and bonus', icon: <ICheckCircle size={20} />, dirty: diff([], ['wAttendance', 'wPunctuality', 'wHours', 'wDiscipline', 'bonusMinScore', 'bonusAmount']) },
    { key: 'ded', label: 'Deductions', hint: 'Taken from gross pay', icon: <IUsers size={20} />, dirty: false },
  ]
  const offNames = off.length ? DAYS.filter(([k]) => off.includes(k)).map(([, l]) => l).join(', ') : 'none'
  return (<>

    <div className="ps-layout">
      <nav className="ps-nav" aria-label="Pay settings sections">
        {SECTIONS.map(x => (
          <button key={x.key} type="button" className={sec === x.key ? 'on' : ''} onClick={e => { setSec(x.key); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }) }}>
            <span className="ps-nav-ic">{x.icon}</span><span className="ps-nav-t"><b>{x.label}</b><small>{x.hint}</small></span>{x.dirty && <i className="ps-dot" title="Unsaved changes" />}
          </button>))}
      </nav>

      <div className="ps-body">
        {sec === 'pay' && <>
          <Card title="Pay mode" hint="How people are paid by default. You can choose a different mode for one employee in their Pay tab.">
            <div className="pa-modes">
              {([['HOURLY', 'Hourly', 'Paid for the hours worked: hours × hourly rate.'], ['MONTHLY', 'Monthly', 'A fixed monthly salary; missing days reduce it by loss of pay.']] as const).map(([k, t, d]) => (
                <button key={k} type="button" className={st.defaultMode === k ? 'on' : ''} onClick={() => setSt({ ...st, defaultMode: k })}><IWallet size={26} /><b>{t}</b><small>{d}</small></button>))}
            </div>
          </Card>
          <Card title="Monthly salary: when hours are short" hint="Applies to people paid a monthly salary. Choose whether a shortfall costs the missing hours or whole days.">
            <div className="pa-modes">
              {([['HOURS', 'By hours', 'The salary covers a set number of hours. Missing hours cost their share of the salary; extra hours earn extra pay.'], ['DAYS', 'By days (loss of pay)', 'A short day loses a full or half day of pay. Set the rules under Loss of pay.']] as const).map(([k, t, d]) => (
                <button key={k} type="button" className={pol.shortfallMethod === k ? 'on' : ''} onClick={() => P({ shortfallMethod: k })}><IClock size={26} /><b>{t}</b><small>{d}</small></button>))}
            </div>
            {pol.shortfallMethod === 'HOURS' && <>
              <div className="pa-grid" style={{ marginTop: 14 }}>
                <Num label="Free days off each month" value={pol.freeOffDays} max={10} onChange={v => P({ freeOffDays: v })} unit="days" hint="Paid days off on top of the weekly off. The salary covers this many days fewer, so taking them costs nothing and working them earns extra." />
              </div>
              <ul className="pa-example">
                <li><b>Hours the salary covers</b>: (working days in the month − {pol.freeOffDays} free {pol.freeOffDays === 1 ? 'day' : 'days'}) × {st.standardDailyHours} h. Working days follow each person's own weekly off.</li>
                <li><b>Hourly rate</b>: monthly salary ÷ those hours.</li>
                <li><b>Fewer hours</b> (worked + paid leave + paid holidays): the missing hours × the hourly rate are taken off.</li>
                <li><b>More hours</b>: the extra hours × the hourly rate × {Number(st.overtimeMultiplier)} (the overtime rate) are added, for people allowed overtime.</li>
                <li>Example: ₹30,000 with 26 working days gives {26 - pol.freeOffDays} × {st.standardDailyHours} = {(26 - pol.freeOffDays) * st.standardDailyHours} h, so ₹{(30000 / ((26 - pol.freeOffDays) * st.standardDailyHours)).toFixed(2)} an hour.</li>
                <li>Someone who joins mid-month is only expected from the day they joined. Daily overtime and the loss of pay rules are not used with this method.</li>
              </ul>
            </>}
          </Card>
          <Card title="Wages & overtime" hint="How a month is divided into days, and how overtime is paid.">
            <div className="pa-grid">
              <div className="pa-num"><label>Monthly pay is divided by</label>
                <select value={pol.workingDaysBasis} onChange={e => P({ workingDaysBasis: e.target.value })}>
                  <option value="SCHEDULED">Working days (month minus weekly offs)</option><option value="CALENDAR">Calendar days in the month</option>
                  <option value="FIXED_26">Fixed 26 days</option><option value="FIXED_30">Fixed 30 days</option></select></div>
              <Num label="Overtime pays" value={st.overtimeMultiplier} min={1} max={5} step={0.05} onChange={v => setSt({ ...st, overtimeMultiplier: v })} unit="× normal rate" />
              <Num label="Overtime starts after" value={pol.otAfterMinutes} max={600} onChange={v => P({ otAfterMinutes: v })} unit="min beyond the day" hint="0 = counts from the first extra minute." />
              <Num label="Daily overtime cap" value={pol.otDailyCapMinutes} max={1440} onChange={v => P({ otDailyCapMinutes: v })} unit="min" hint="0 = no cap." />
            </div>
          </Card>
        </>}

        {sec === 'time' && <Card title="Work time" hint="The standard working day and the company weekly off. Individual employees can have their own weekly off in their Pay tab, or by asking HR from the Leave page.">
          <div className="pa-grid">
            <Num label="Standard hours per day" value={st.standardDailyHours} min={1} max={24} onChange={v => setSt({ ...st, standardDailyHours: v })} unit="hours" />
          </div>
          <label className="pa-lbl">Company weekly off (the default for everyone)</label>
          <div className="lc-quick pa-days">{DAYS.map(([k, l]) => <button key={k} type="button" className={off.includes(k) ? 'on' : ''} onClick={() => setSt({ ...st, weeklyOffDays: off.includes(k) ? off.filter(x => x !== k) : [...off, k] })}>{l}</button>)}</div>
        </Card>}

        {sec === 'lop' && <Card title="Loss of pay" hint="What happens when the daily work time is not achieved. Applies to monthly-salary employees."
          right={<Switch on={pol.lopEnabled} onClick={() => P({ lopEnabled: !pol.lopEnabled })} label={pol.lopEnabled ? 'Rules on' : 'Rules off'} />}>
          {pol.shortfallMethod === 'HOURS' && <p className="pa-note">Monthly salaries are currently paid <b>by hours</b>, so these day rules are not used for pay. Change it under Pay &amp; overtime to use them.</p>}
          <div className={pol.lopEnabled && pol.shortfallMethod !== 'HOURS' ? '' : 'pa-dim'}>
            <div className="pa-grid">
              <Num label="Grace on the day's hours" value={pol.graceMinutes} max={120} onChange={v => P({ graceMinutes: v })} unit="min" />
              <Num label="Half day needs at least" value={pol.halfDayMinMinutes} min={30} max={720} onChange={v => P({ halfDayMinMinutes: v })} unit="min" />
              <div className="pa-num"><label>Shift starts at</label><div><input type="time" value={pol.shiftStart} onChange={e => P({ shiftStart: e.target.value })} /></div></div>
              <Num label="Late grace" value={pol.lateGraceMinutes} max={120} onChange={v => P({ lateGraceMinutes: v })} unit="min" />
              <Num label="Late arrivals that cost a half day" value={pol.lateCountForHalfDay} max={31} onChange={v => P({ lateCountForHalfDay: v })} unit="lates" hint="0 = lateness never costs pay." />
            </div>
            <ul className="pa-example">
              <li><b>Full day</b>: {hm(Math.max(1, std - pol.graceMinutes))} or more worked. No loss of pay.</li>
              <li><b>Half day</b>: {hm(pol.halfDayMinMinutes)} to just under a full day. Loses 0.5 day of pay.</li>
              <li><b>Less than that, or no punch</b>: loses 1 day of pay.</li>
              <li><b>Late</b>: checking in after {lateAfter}.{pol.lateCountForHalfDay > 0 && <> Every {pol.lateCountForHalfDay} late arrivals in a month loses 0.5 day.</>}</li>
              <li>Approved paid leave, holidays and weekly offs never lose pay. HR can change any day in <b>Payroll, Loss of pay review</b>.</li>
            </ul>
          </div>
        </Card>}

        {sec === 'score' && <Card title="Honour score" hint="Each employee gets a monthly score from 0 to 100. Choose how much each part counts.">
          <div className="pa-weights">
            {([['wAttendance', 'Attendance', 'Days present out of days required'], ['wPunctuality', 'On time', 'Check-ins before the late limit'], ['wHours', 'Full hours', 'Days with the full day worked'], ['wDiscipline', 'Discipline', 'Fewer flagged punches and corrections']] as const).map(([k, l, d]) => (
              <div key={k} className="pa-w"><div><b>{l}</b><small>{d}</small></div>
                <input type="number" min="0" max="100" value={pol[k]} onChange={e => P({ [k]: Number(e.target.value) } as any)} />
                <span>{wsum ? Math.round((pol[k] / wsum) * 100) : 0}%</span></div>))}
          </div>
          <div className="pa-bar">{[['wAttendance', '#287A3E'], ['wPunctuality', '#8ad04e'], ['wHours', '#f5c542'], ['wDiscipline', '#E87516']].map(([k, c]) => <i key={k} style={{ width: `${wsum ? ((pol as any)[k] / wsum) * 100 : 0}%`, background: c }} />)}</div>
          <div className="pa-levels"><span className="lv gold">Gold 90+</span><span className="lv silver">Silver 75+</span><span className="lv bronze">Bronze 60+</span><span className="lv imp">Needs improvement</span></div>
          <div className="pa-grid" style={{ marginTop: 14 }}>
            <Num label="Attendance bonus for a score of" value={pol.bonusMinScore} max={100} onChange={v => P({ bonusMinScore: v })} unit="or more" hint="0 = no bonus." />
            <Num label="Bonus amount" value={pol.bonusAmount} step={50} onChange={v => P({ bonusAmount: v })} unit="per month" />
          </div>
        </Card>}

        {sec === 'ded' && <Deductions />}
      </div>
    </div>

    {(dirty || msg || err) && <div className="ap-bar pa-save">
      {err ? <span style={{ color: '#fca5a5' }}>{err}</span> : msg && !dirty ? <span>{msg}</span> : <span><b>Unsaved changes</b></span>}
      {dirty && <><button className="lh-ok" onClick={save}><ICheckCircle size={18} />Save</button><button className="ap-clear" onClick={discard}>Discard</button></>}
      {!dirty && (msg || err) && <button className="ap-clear" onClick={() => { setMsg(''); setErr('') }}>OK</button>}
    </div>}
  </>)
}

/* ============ Language ============ */

export function LanguageSettings() {
  const { t, lang } = useT()
  const L = useLoad<Gen>('/api/hr/general-settings')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const current = L.data?.defaultLanguage ?? 'en'
  async function setDefault(l: string) {
    if (l === current || busy) return
    setBusy(true); setErr(''); setMsg('')
    try { await put('/api/hr/general-settings', { defaultLanguage: l }); setMsg(t('h_saved')); L.reload() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (<>
    <Card title={t('h_langScreenT')} hint={t('h_langScreenD')}>
      <div className="lg2-row">{LANGS.map(([k, l]) => <button key={k} type="button" className={lang === k ? 'on' : ''} onClick={() => setLang(k)}>{l}</button>)}</div>
    </Card>
    <Card title={t('h_langDefaultT')} hint={t('h_langDefaultD')}>
      <div className="lg2-row">{LANGS.map(([k, l]) => <button key={k} type="button" className={current === k ? 'on' : ''} disabled={busy || !L.data} onClick={() => setDefault(k)}>{l}</button>)}</div>
      {err && <p className="err">{err}</p>}{msg && !err && <p className="msg">{msg}</p>}
    </Card>
  </>)
}

/* ============ App info ============ */

declare const __APP_VERSION__: string

export function AppInfo() {
  const info = useLoad<any>('/api/hr/app-info')
  const gen = useLoad<Gen>('/api/hr/general-settings')
  const d = info.data
  const rows: [string, string][] = [
    ['App', 'Arudra Attender'],
    ['Company', gen.data?.companyName ?? '…'],
    ['App version', __APP_VERSION__],
    ['Server version', d?.backendVersion ?? '…'],
    ['Server time', d ? new Date(d.serverTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '…'],
    ['Server time zone', d?.timeZone ?? '…'],
    ['Developed by', 'Arun'],
    ['Contact', '9629129864'],
  ]
  return (
    <Card title="App info" hint="Details to share with support if something needs looking at.">
      {info.err && <p className="err">{info.err}</p>}
      <div className="ps-rows">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    </Card>
  )
}

/* ============ General settings ============ */

type Gen = { companyName: string; legalName: string; companyAddress: string; addressLine2: string; city: string; state: string; pincode: string; companyPhone: string; companyEmail: string; website: string; gstin: string; pan: string; defaultLanguage: string; geoGraceMeters: number; maxAccuracyMarginMeters: number; kioskMinGapSeconds: number; phoneFaceRequired: boolean; onCheckFail: 'ASK' | 'BLOCK' | 'FLAG' }

function Field({ label, children, hint, error, required, full }: { label: string; children: React.ReactNode; hint?: string; error?: string; required?: boolean; full?: boolean }) {
  return (
    <div className={`gf-f${full ? ' full' : ''}${error ? ' bad' : ''}`}>
      <label>{label}{required && <span className="gf-req"> *</span>}</label>
      {children}
      {error ? <small className="gf-err">{error}</small> : hint ? <small>{hint}</small> : null}
    </div>
  )
}

/** Client-side checks that mirror the server's, so mistakes show next to the field before saving. */
function companyErrors(g: Gen): Partial<Record<keyof Gen, string>> {
  const e: Partial<Record<keyof Gen, string>> = {}
  if (!g.companyName.trim()) e.companyName = 'Company name is required'
  if (g.companyEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.companyEmail.trim())) e.companyEmail = 'Enter a valid email, like hr@company.com'
  if (g.companyPhone.trim() && g.companyPhone.replace(/\D/g, '').length < 7) e.companyPhone = 'Enter a valid phone number'
  if (g.pincode && !/^\d{6}$/.test(g.pincode)) e.pincode = 'PIN code is 6 digits'
  if (g.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g.gstin)) e.gstin = 'Looks incomplete: 15 characters like 33ABCDE1234F1Z5'
  if (g.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(g.pan)) e.pan = 'Looks incomplete: 10 characters like ABCDE1234F'
  if (g.website.trim() && !/^https?:\/\/\S+\.\S+/i.test(g.website.trim())) e.website = 'Start with http:// or https://'
  return e
}

export function GeneralSettings() {
  const L = useLoad<Gen>('/api/hr/general-settings')
  const [g, setG] = useState<Gen | null>(null)
  const [sec, setSec] = useState<'co' | 'punch'>('co')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { if (L.data) setG({ ...L.data }) }, [L.data])
  if (!g || !L.data) return <div className="lh-sec muted">{L.err || 'Loading…'}</div>
  const dirty = JSON.stringify(g) !== JSON.stringify(L.data)
  const P = (patch: Partial<Gen>) => { setG({ ...g, ...patch }); setMsg(''); setErr('') }
  async function save() {
    setErr(''); setMsg('')
    try {
      await put('/api/hr/general-settings', { ...g, geoGraceMeters: Number(g!.geoGraceMeters), maxAccuracyMarginMeters: Number(g!.maxAccuracyMarginMeters), kioskMinGapSeconds: Number(g!.kioskMinGapSeconds) })
      setMsg('Saved. Punch rules apply from the next punch.'); L.reload()
    } catch (e: any) { setErr(e.message) }
  }
  const c0 = L.data
  const CO_KEYS: (keyof Gen)[] = ['companyName', 'legalName', 'companyAddress', 'addressLine2', 'city', 'state', 'pincode', 'companyPhone', 'companyEmail', 'website', 'gstin', 'pan']
  const coDirty = CO_KEYS.some(k => g[k] !== c0[k])
  const fe = companyErrors(g)
  const bad = Object.keys(fe).length > 0
  const puDirty = g.geoGraceMeters !== c0.geoGraceMeters || g.maxAccuracyMarginMeters !== c0.maxAccuracyMarginMeters || g.kioskMinGapSeconds !== c0.kioskMinGapSeconds || g.phoneFaceRequired !== c0.phoneFaceRequired || g.onCheckFail !== c0.onCheckFail
  const SECTIONS = [
    { key: 'co' as const, label: 'Company', hint: 'Details, contact, address', icon: <IUsers size={20} />, dirty: coDirty },
    { key: 'punch' as const, label: 'Punch rules', hint: 'Location and face checks', icon: <IClock size={20} />, dirty: puDirty },
  ]
  return (<>
    <div className="ps-layout">
      <nav className="ps-nav" aria-label="General settings sections">
        {SECTIONS.map(x => (
          <button key={x.key} type="button" className={sec === x.key ? 'on' : ''} onClick={() => setSec(x.key)}>
            <span className="ps-nav-ic">{x.icon}</span><span className="ps-nav-t"><b>{x.label}</b><small>{x.hint}</small></span>{x.dirty && <i className="ps-dot" title="Unsaved changes" />}
          </button>))}
      </nav>
      <div className="ps-body">
        {sec === 'co' && <>
          <Card title="Business details" hint="How your company appears to HR. The legal name and tax numbers are for records and payslips.">
            <div className="gf-grid">
              <Field label="Company name" required hint="The short name people know you by." error={fe.companyName}>
                <input value={g.companyName} maxLength={120} placeholder="e.g. Arudra" onChange={e => P({ companyName: e.target.value })} /></Field>
              <Field label="Legal / registered name" hint="As on your registration, if different." error={fe.legalName}>
                <input value={g.legalName} maxLength={160} placeholder="e.g. Arudra Commercial Services Pvt Ltd" onChange={e => P({ legalName: e.target.value })} /></Field>
              <Field label="GSTIN" hint="15 characters. Leave blank if not registered." error={fe.gstin}>
                <input value={g.gstin} maxLength={15} placeholder="33ABCDE1234F1Z5" style={{ textTransform: 'uppercase' }} onChange={e => P({ gstin: e.target.value.toUpperCase() })} /></Field>
              <Field label="PAN" hint="10 characters." error={fe.pan}>
                <input value={g.pan} maxLength={10} placeholder="ABCDE1234F" style={{ textTransform: 'uppercase' }} onChange={e => P({ pan: e.target.value.toUpperCase() })} /></Field>
            </div>
          </Card>
          <Card title="Contact" hint="Where employees and HR can reach the company.">
            <div className="gf-grid">
              <Field label="Phone" error={fe.companyPhone}>
                <input type="tel" inputMode="tel" value={g.companyPhone} maxLength={30} placeholder="+91 98765 43210" onChange={e => P({ companyPhone: e.target.value })} /></Field>
              <Field label="Email" error={fe.companyEmail}>
                <input type="email" value={g.companyEmail} maxLength={120} placeholder="hr@yourcompany.com" onChange={e => P({ companyEmail: e.target.value })} /></Field>
              <Field label="Website" full error={fe.website}>
                <input type="url" value={g.website} maxLength={150} placeholder="https://yourcompany.com" onChange={e => P({ website: e.target.value })} /></Field>
            </div>
          </Card>
          <Card title="Address" hint="The registered or head-office address.">
            <div className="gf-grid">
              <Field label="Address line 1" full error={fe.companyAddress}>
                <input value={g.companyAddress} maxLength={200} placeholder="Door no., street" onChange={e => P({ companyAddress: e.target.value })} /></Field>
              <Field label="Address line 2" full error={fe.addressLine2}>
                <input value={g.addressLine2} maxLength={200} placeholder="Area, landmark (optional)" onChange={e => P({ addressLine2: e.target.value })} /></Field>
              <Field label="City" error={fe.city}><input value={g.city} maxLength={80} onChange={e => P({ city: e.target.value })} /></Field>
              <Field label="State" error={fe.state}><input value={g.state} maxLength={80} onChange={e => P({ state: e.target.value })} /></Field>
              <Field label="PIN code" error={fe.pincode}>
                <input inputMode="numeric" value={g.pincode} maxLength={6} placeholder="600001" onChange={e => P({ pincode: e.target.value.replace(/\D/g, '') })} /></Field>
            </div>
          </Card>
        </>}
        {sec === 'punch' && <>
          <Card title="When a check fails" hint="A punch can fail the location, office WiFi, face or phone check. Choose what happens next.">
            <div className="pa-modes pa-modes3">
              {([['ASK', 'Employee chooses', 'They are told what failed, then fix it and try again, or send it to HR with a reason. HR only sees what they send.'],
                 ['BLOCK', 'Block the punch', 'The punch is refused and nothing is recorded. They must fix the problem or ask HR.'],
                 ['FLAG', 'Record and flag', 'The punch is recorded straight away and every failed one goes to HR to approve.']] as const).map(([k, t, d]) => (
                <button key={k} type="button" className={g.onCheckFail === k ? 'on' : ''} onClick={() => P({ onCheckFail: k })}><IAlert size={24} /><b>{t}</b><small>{d}</small></button>))}
            </div>
          </Card>
          <Card title="Location checks" hint="A punch from a phone or kiosk must be inside the radius of a saved location (Locations page).">
            <div className="pa-grid">
              <Num label="Extra distance allowed" value={g.geoGraceMeters} max={1000} onChange={v => P({ geoGraceMeters: v })} unit="metres" hint="Added to each location's radius." />
              <Num label="Most GPS error forgiven" value={g.maxAccuracyMarginMeters} max={2000} onChange={v => P({ maxAccuracyMarginMeters: v })} unit="metres" hint="A weak GPS fix helps the person by at most this much." />
            </div>
          </Card>
          <Card title="Punching" hint="Rules that stop accidental and borrowed punches.">
            <div className="pa-grid">
              <Num label="Minimum time between in and out" value={g.kioskMinGapSeconds} max={3600} onChange={v => P({ kioskMinGapSeconds: v })} unit="seconds" hint="Stops a double scan at the kiosk from clocking someone straight back out." />
            </div>
            <div style={{ marginTop: 12 }}><Switch on={g.phoneFaceRequired} onClick={() => P({ phoneFaceRequired: !g.phoneFaceRequired })} label={g.phoneFaceRequired ? 'Phone punches need a matching face' : 'Phone punches do not need a face'} /></div>
          </Card>
        </>}
      </div>
    </div>
    {(dirty || msg || err) && <div className="ap-bar pa-save">
      {err ? <span style={{ color: '#fca5a5' }}>{err}</span> : msg && !dirty ? <span>{msg}</span> : <span><b>Unsaved changes</b></span>}
      {dirty && <><button className="lh-ok" onClick={save} disabled={bad} title={bad ? 'Fix the highlighted fields first' : ''}><ICheckCircle size={18} />Save</button><button className="ap-clear" onClick={() => setG({ ...L.data! })}>Discard</button></>}
      {!dirty && (msg || err) && <button className="ap-clear" onClick={() => { setMsg(''); setErr('') }}>OK</button>}
    </div>}
  </>)
}

function Deductions() {
  const rules = useLoad<any[]>('/api/hr/deductions')
  const blank = { name: '', kind: 'PERCENT', amount: '', wageCap: '', minGross: '', maxGross: '' }
  const [r, setR] = useState(blank)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const n = (v: string) => (v === '' ? null : Number(v))
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/deductions', { name: r.name, kind: r.kind, amount: Number(r.amount), wageCap: n(r.wageCap), minGross: n(r.minGross), maxGross: n(r.maxGross), active: true }); setR(blank); setOpen(false); rules.reload() } catch (e: any) { setErr(e.message) }
  }
  return (
    <Card title="Deductions" hint="Each active rule is taken from gross pay on every payslip. The seeded ones are examples and are off: rates differ by country and year, so check them first."
      right={<button className="lh-add" onClick={() => setOpen(o => !o)}>{open ? 'Close' : '+ Add deduction'}</button>}>
      {open && <form className="lh-form lc-add" onSubmit={add}>
        <div className="grid">
          <div><label>Name</label><input value={r.name} onChange={e => setR({ ...r, name: e.target.value })} required /></div>
          <div><label>Kind</label><select value={r.kind} onChange={e => setR({ ...r, kind: e.target.value })}><option value="PERCENT">Percent of gross</option><option value="FIXED">Fixed amount</option></select></div>
          <div><label>{r.kind === 'PERCENT' ? 'Percent' : 'Amount'}</label><input type="number" step="0.01" min="0" value={r.amount} onChange={e => setR({ ...r, amount: e.target.value })} required /></div>
          <div><label>Wage cap (optional)</label><input type="number" min="0" value={r.wageCap} onChange={e => setR({ ...r, wageCap: e.target.value })} /></div>
          <div><label>Only if gross at least</label><input type="number" min="0" value={r.minGross} onChange={e => setR({ ...r, minGross: e.target.value })} /></div>
          <div><label>Only if gross at most</label><input type="number" min="0" value={r.maxGross} onChange={e => setR({ ...r, maxGross: e.target.value })} /></div>
        </div>{err && <div className="err">{err}</div>}<p style={{ marginBottom: 0 }}><button className="btn">Add deduction</button></p></form>}
      <div className="lh-types">
        {rules.data?.map(x => (
          <div key={x.id} className={`lh-type${x.active ? '' : ' off'}`}>
            <b>{x.name}</b>
            <div className="pa-rule"><span className="lh-chip">{x.kind === 'PERCENT' ? `${Number(x.amount)}%` : `${Number(x.amount)} flat`}</span>
              {x.wageCap != null && <span className="lh-chip">cap {x.wageCap}</span>}{x.minGross != null && <span className="lh-chip">from {x.minGross}</span>}{x.maxGross != null && <span className="lh-chip">up to {x.maxGross}</span>}</div>
            <div className="lh-toggles"><Switch on={x.active} label={x.active ? 'On' : 'Off'} onClick={async () => { await put(`/api/hr/deductions/${x.id}`, { ...x, active: !x.active }); rules.reload() }} />
              <button className="lc-del" onClick={async () => { if (confirm(`Delete ${x.name}?`)) { await del(`/api/hr/deductions/${x.id}`); rules.reload() } }}>Delete</button></div>
          </div>))}
      </div>
    </Card>
  )
}

/* ============ Payroll ============ */

export function Payroll() {
  const { data, reload } = useLoad<any[]>('/api/hr/payroll/runs')
  const [period, setPeriod] = useState(today().slice(0, 7))
  const [mode, setMode] = useState('HOURLY')
  useEffect(() => { get('/api/hr/settings').then(s => setMode(s.defaultMode)).catch(() => {}) }, [])
  const [err, setErr] = useState('')
  const [run, setRun] = useState<number | null>(null)
  const [prev, setPrev] = useState<any[] | null>(null)
  const slips = useLoad<any[]>(run ? `/api/hr/payroll/runs/${run}/payslips` : '/api/hr/payroll/runs', [run])
  async function preview() {
    setErr('')
    try { setPrev(await post('/api/hr/payroll/preview', { period, mode })); setRun(null) } catch (e: any) { setErr(e.message) }
  }
  async function gen() {
    setErr('')
    try { const r = await post('/api/hr/payroll/generate', { period, mode }); setRun(r.runId); setPrev(null); reload() } catch (e: any) { setErr(e.message) }
  }
  const adjust = async (id: number) => {
    const v = prompt('Adjustment amount (negative for a deduction)')
    if (v === null || isNaN(Number(v))) return
    await post(`/api/hr/payroll/payslips/${id}/adjust`, { amount: Number(v) }); slips.reload()
  }
  const rows: any[] | null = run && slips.data ? (slips.data as any[]) : prev
  const total = (k: string) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0)
  return (<>
    <div className="lh-stats">
      <div className="lh-stat g"><span><IWallet size={26} /></span><b>{rows ? money(total('net')) : '—'}</b><small>{prev ? 'Net pay (preview)' : run ? 'Net pay (generated)' : 'Net pay'}</small></div>
      <div className="lh-stat y"><span><IUsers size={26} /></span><b>{rows?.length ?? '—'}</b><small>Employees</small></div>
    </div>
    <Card title="Generate payroll" hint="Pay comes from approved attendance hours, plus a standard day for each paid holiday and paid leave day. Resolve “To approve” and “Leave” first. Check the preview, then generate.">
      <form className="pa-gen" onSubmit={e => { e.preventDefault(); preview() }}>
        <input type="month" value={period} onChange={e => { setPeriod(e.target.value); setPrev(null) }} />
        <select value={mode} onChange={e => { setMode(e.target.value); setPrev(null) }}><option value="HOURLY">Hourly (default)</option><option value="MONTHLY">Monthly (default)</option></select>
        <button className="lh-add">Preview</button>
        <button type="button" className="btn" onClick={gen} disabled={!prev}>Generate</button>
      </form>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>The mode is used for employees with no pay mode of their own. Generate is available after you preview.</p>
      {err && <div className="err">{err}</div>}
    </Card>

    {rows && <Card title={prev ? `Preview for ${period}` : 'Payslips'} hint={prev ? 'Nothing is saved yet. Generate to create the payslips.' : undefined}>
      <div className="scroll"><table className="pa-table">
        <thead><tr><th>Employee</th><th>Hours</th><th>OT / Extra</th><th>Allow.</th><th>Loss of pay / Short</th><th>Bonus</th><th>Gross</th><th>Deduct.</th>{!prev && <th>Adjust</th>}<th>Net</th><th>Score</th></tr></thead>
        <tbody>{rows.map(p => (
          <tr key={p.id ?? p.employeeId}>
            <td><b>{p.employeeName}</b><div className="muted">{(p.payMode ?? p.mode ?? '').toLowerCase()}</div></td>
            <td>{p.regularHours} h{Number(p.creditHours) > 0 && <div className="muted">+{p.creditHours} h leave/holiday</div>}{p.shortfallMethod === 'HOURS' && <div className="muted">of {p.requiredHours} h</div>}</td>
            <td>{p.shortfallMethod === 'HOURS' ? (Number(p.extraHours) > 0 ? <span className="pa-xtra">+{p.extraHours} h<div>+{money(p.extraAmount)}</div></span> : '—') : `${p.overtimeHours} h`}</td>
            <td>{money(p.allowances)}</td>
            <td>{p.shortfallMethod === 'HOURS' ? (Number(p.shortfallHours) > 0 ? <span className="pa-lop">{Number(p.shortfallHours)} h<div>−{money(p.shortfallAmount)}</div></span> : '—')
              : Number(p.lopDays) > 0 ? <span className="pa-lop">{Number(p.lopDays)} d<div>−{money(p.lopAmount)}</div></span> : '—'}</td>
            <td>{Number(p.bonus) > 0 ? money(p.bonus) : '—'}</td>
            <td>{money(p.gross)}</td>
            <td title={p.deductionDetail ?? ''}>{money(p.deductions)}</td>
            {!prev && <td>{money(p.adjustments)} <button className="at-fix" onClick={() => adjust(p.id)} aria-label="Adjust">±</button></td>}
            <td><b>{money(p.net)}</b></td>
            <td>{p.score != null ? <span className={`pa-sc ${levelOf(p.score)}`}>{p.score}</span> : '—'}</td>
          </tr>))}</tbody>
      </table></div>
    </Card>}

    <Card title="Past runs">
      {data?.length === 0 && <p className="muted" style={{ margin: 0 }}>No payroll generated yet.</p>}
      <div className="lh-types">
        {data?.map(r => (
          <div key={r.id} className={`lh-type${run === r.id ? ' lc-sel' : ''}`}><b>{r.period}</b>
            <small className="muted">{r.mode.toLowerCase()} · {fmtDateTime(r.createdAt)}</small>
            <button className="lh-add" onClick={() => { setRun(r.id); setPrev(null) }}>View payslips</button></div>))}
      </div>
    </Card>
  </>)
}

const levelOf = (s: number) => (s >= 90 ? 'gold' : s >= 75 ? 'silver' : s >= 60 ? 'bronze' : 'imp')

/* ============ Loss of pay review ============ */

const STATUS: Record<string, string> = { FULL: 'Full day', HALF: 'Half day', SHORT: 'Too short', ABSENT: 'Absent', LEAVE: 'Paid leave', UNPAID_LEAVE: 'Unpaid leave', HOLIDAY: 'Holiday', HOLIDAY_UNPAID: 'Unpaid holiday', OFF: 'Weekly off' }

export function LopReview() {
  const emps = useLoad<any[]>('/api/hr/employees').data
  const [emp, setEmp] = useState('')
  const [month, setMonth] = useState(today().slice(0, 7))
  const pol = useLoad<Pol>('/api/hr/policy').data
  const { data, reload } = useLoad<any>(emp ? `/api/hr/attendance/day-status?employeeId=${emp}&month=${month}` : '/api/hr/policy', [emp, month])
  const [edit, setEdit] = useState<null | { date: string; lop: number; reason: string }>(null)
  const [err, setErr] = useState('')
  const days: any[] = emp && data?.days ? data.days : []
  async function saveOv(clear = false) {
    if (!edit) return
    setErr('')
    try { await put('/api/hr/attendance/lop-override', { employeeId: Number(emp), date: edit.date, lopDays: clear ? null : edit.lop, reason: edit.reason }); setEdit(null); reload() } catch (e: any) { setErr(e.message) }
  }
  return (<>
    {pol && !pol.lopEnabled && <div className="lc-state"><IAlert size={20} /><span><b>Loss of pay rules are off.</b> This page shows what they would do; payroll ignores it until you turn the rules on in Settings.</span></div>}
    <Card title="Loss of pay review" hint="Day by day, what each employee's attendance means for pay. Change a day if there is a good reason, and it is recorded.">
      <div className="pa-gen"><select value={emp} onChange={e => setEmp(e.target.value)}><option value="">Choose an employee…</option>{emps?.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
      {emp && data?.days && <div className="lh-stats" style={{ marginTop: 14, marginBottom: 6 }}>
        <div className="lh-stat y"><span><IClock size={26} /></span><b>{Number(data.lopDays)}</b><small>Loss of pay days{Number(data.lateLop) > 0 && ` (${data.lateLop} from ${data.lateDays} late arrivals)`}</small></div>
        <div className="lh-stat g"><span><ICal size={26} /></span><b>{days.filter(d => ['FULL', 'HALF', 'SHORT'].includes(d.status)).length}</b><small>Days worked</small></div>
      </div>}
      {!emp && <div className="lh-empty"><IUsers size={34} /><b>Pick an employee</b><small>Their month will show here.</small></div>}
      {err && <div className="err">{err}</div>}
      <div className="at-list" style={{ marginTop: 10 }}>
        {days.filter(d => d.status !== 'OFF').map(d => (
          <div key={d.date} className={`at-row pa-day ${d.status === 'FULL' || d.status.startsWith('HOLIDAY') && d.status === 'HOLIDAY' || d.status === 'LEAVE' ? 'present' : d.status === 'HALF' ? 'leave' : 'absent'}`}>
            <span className="lh-hd" style={{ width: 44, height: 44 }}><b>{new Date(d.date + 'T00:00').getDate()}</b>{new Date(d.date + 'T00:00').toLocaleDateString([], { weekday: 'short' })}</span>
            <div className="at-who"><b>{STATUS[d.status] ?? d.status}</b><small>{d.workedMinutes > 0 ? `${hm(d.workedMinutes)} worked` : 'No hours'}{d.lateMinutes > 0 && ` · ${d.lateMinutes} min late`}{d.shortMinutes > 0 && d.workedMinutes > 0 && ` · ${d.shortMinutes} min short`}</small></div>
            <div className="at-times" style={{ gridColumn: 'auto' }}>{d.overridden && <span className="lh-chip warn" title={d.reason ?? ''}>changed by HR{d.reason ? `: ${d.reason}` : ''}</span>}</div>
            <div className="at-hours"><b>{Number(d.lop) > 0 ? `−${d.lop} day` : 'No loss'}</b></div>
            <span />
            <button className="at-fix" onClick={() => setEdit({ date: d.date, lop: Number(d.lop), reason: d.reason ?? '' })} aria-label="Change this day">✎</button>
          </div>))}
      </div>
    </Card>
    {edit && <div className="overlay center" onMouseDown={e => { if (e.target === e.currentTarget) setEdit(null) }}>
      <div className="modal small"><h2>Change {new Date(edit.date + 'T00:00').toLocaleDateString([], { day: 'numeric', month: 'short' })}</h2>
        <label>Loss of pay for this day</label>
        <div className="pm-seg" style={{ display: 'flex', gap: 8 }}>{[0, 0.5, 1].map(v => <button key={v} type="button" className={`lc-q${edit.lop === v ? ' on' : ''}`} onClick={() => setEdit({ ...edit, lop: v })}>{v === 0 ? 'None' : v === 0.5 ? 'Half day' : 'Full day'}</button>)}</div>
        <label>Reason (required)</label><input value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} placeholder="e.g. System was down, approved by manager" />
        {err && <div className="err">{err}</div>}
        <div className="actions"><button className="btn" onClick={() => saveOv()}>Save</button><button className="btn ghost" onClick={() => saveOv(true)}>Use the automatic result</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
      </div></div>}
  </>)
}

/* ============ Honour scores ============ */

const LEVEL: Record<string, string> = { GOLD: 'Gold', SILVER: 'Silver', BRONZE: 'Bronze', IMPROVE: 'Needs improvement', NO_DATA: 'No data yet' }

export function Scores() {
  const [month, setMonth] = useState(today().slice(0, 7))
  const { data } = useLoad<any[]>(`/api/hr/scores?month=${month}`, [month])
  const [open, setOpen] = useState<number | null>(null)
  const rows = [...(data ?? [])].sort((a, b) => (b.score.score ?? -1) - (a.score.score ?? -1))
  const scored = rows.filter(r => r.score.score != null)
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score.score, 0) / scored.length) : null
  return (<>
    <div className="at-bar"><div className="at-date"><label><ICal size={18} /><b>{new Date(month + '-01T00:00').toLocaleDateString([], { month: 'long', year: 'numeric' })}</b><input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label></div></div>
    <div className="lh-stats">
      <div className="lh-stat g"><span><ICheckCircle size={26} /></span><b>{avg ?? '—'}</b><small>Average score</small></div>
      <div className="lh-stat y"><span><IUsers size={26} /></span><b>{scored.filter(r => r.score.score >= 90).length}</b><small>Gold (90+)</small></div>
    </div>
    <Card title="Honour scores" hint="Each month's score out of 100. Approved leave, holidays and weekly offs are not counted against anyone. Tap a person for the breakdown.">
      {data && rows.length === 0 && <div className="lh-empty"><IUsers size={34} /><b>No employees</b></div>}
      <div className="lh-reqs">
        {rows.map((r, i) => { const s = r.score; return (
          <div key={r.employeeId} className="pa-score" onClick={() => setOpen(open === r.employeeId ? null : r.employeeId)}>
            <span className="pa-rank">{s.score != null ? i + 1 : ''}</span>
            <span className="lh-av">{initials(r.employeeName)}</span>
            <div className="at-who"><b>{r.employeeName}</b><small>{r.employeeCode}</small></div>
            <span className={`pa-lv ${s.level.toLowerCase()}`}>{LEVEL[s.level]}</span>
            <span className={`pa-ring ${s.score != null ? levelOf(s.score) : 'imp'}`} style={{ ['--p' as any]: `${s.score ?? 0}%` }}><b>{s.score ?? '—'}</b></span>
            {open === r.employeeId && <div className="pa-break">
              {[['Attendance', s.attendancePct, `${s.fullDays} full + ${s.halfDays} half of ${s.requiredDays} days`], ['On time', s.punctualityPct, `${s.lateDays} late arrivals`], ['Full hours', s.hoursPct, ''], ['Discipline', s.disciplinePct, `${s.flaggedPunches} flagged punches, ${s.corrections} corrections`]].map(([l, v, d]) => (
                <div key={l as string}><span>{l as string}<small>{d as string}</small></span><div className="pa-meter"><i style={{ width: `${v}%` }} /></div><b>{v as number}%</b></div>))}
            </div>}
          </div>) })}
      </div>
    </Card>
  </>)
}

