import { FormEvent, useEffect, useState } from 'react'
import { del, get, post, put } from '../lib/api'
import { ICheckCircle, IAlert, IPin, ISend } from '../components/icons'
import { Svg } from '../components/icons'
import './leaveHolidays.css'
import './attendanceAdmin.css'
import './approvalsAdmin.css'
import './locationsAdmin.css'

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const reload = () => get<T>(path).then(setData).catch(e => setErr(e.message))
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [path])
  return { data, err, reload }
}

const IWifi = ({ size = 22 }: { size?: number }) => <Svg size={size}><path d="M2.500 9a14 14 0 0 1 19 0M5.500 12.500a9.500 9.500 0 0 1 13 0M8.500 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.300" r="1" /></Svg>
const ITrash = ({ size = 18 }: { size?: number }) => <Svg size={size}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>
const IAim = ({ size = 18 }: { size?: number }) => <Svg size={size}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>

function Toggle({ on, onLabel, offLabel, onClick }: { on: boolean; onLabel: string; offLabel: string; onClick: () => void }) {
  return <button type="button" className={`lh-tg${on ? ' on' : ''}`} onClick={onClick}><i />{on ? onLabel : offLabel}</button>
}

/* ---------------- Locations ---------------- */

const RADII = [50, 100, 200, 500]

function LocationCard({ l, onSaved }: { l: any; onSaved: () => void }) {
  const [name, setName] = useState<string>(l.name)
  const [radius, setRadius] = useState<number>(l.radiusMeters)
  const [err, setErr] = useState('')
  const dirty = name.trim() !== l.name || radius !== l.radiusMeters
  const save = async () => {
    setErr('')
    if (!name.trim() || !(radius >= 10)) { setErr('Enter a name and a radius of at least 10 m'); return }
    try { await put(`/api/hr/attendance/locations/${l.id}`, { name: name.trim(), radiusMeters: radius }); onSaved() } catch (e: any) { setErr(e.message) }
  }
  return (
    <div className={`lh-type lc-card${l.active ? '' : ' off'}`}>
      <div className="lh-type-top">
        <span className="lh-ic"><IPin size={24} /></span>
        <div className="lh-type-name"><input value={name} onChange={e => setName(e.target.value)} aria-label="Location name" />
          <small>{l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}</small></div>
      </div>
      <div className="lc-radius">
        <div className="lc-ring" style={{ ['--r' as any]: `${Math.min(100, 28 + radius / 8)}%` }}><span><IPin size={16} /></span></div>
        <div className="lc-r-in">
          <label>Allowed distance</label>
          <div className="lc-r-row"><input type="number" min="10" value={radius} onChange={e => setRadius(Number(e.target.value))} aria-label="Radius in metres" /><em>metres</em></div>
          <div className="lc-quick">{RADII.map(r => <button key={r} type="button" className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>{r} m</button>)}</div>
        </div>
      </div>
      <div className="lh-toggles">
        <Toggle on={l.active} onLabel="Active" offLabel="Off" onClick={async () => { await put(`/api/hr/attendance/locations/${l.id}`, { active: !l.active }); onSaved() }} />
        <a className="lc-map" href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer"><ISend size={14} />Open in Maps</a>
      </div>
      {err && <div className="err">{err}</div>}
      {dirty && <button className="lh-save" onClick={save}>Save changes</button>}
    </div>
  )
}

export function Locations() {
  const { data, reload } = useLoad<any[]>('/api/hr/attendance/locations')
  const [f, setF] = useState({ name: '', latitude: '', longitude: '', radiusMeters: '100' })
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const here = () => {
    setLocating(true); setErr('')
    navigator.geolocation.getCurrentPosition(
      p => { setF(x => ({ ...x, latitude: String(p.coords.latitude), longitude: String(p.coords.longitude) })); setLocating(false) },
      () => { setErr('Location unavailable. Allow location access, or type the coordinates.'); setLocating(false) }, { enableHighAccuracy: true, timeout: 10000 })
  }
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try {
      await post('/api/hr/attendance/locations', { name: f.name, latitude: Number(f.latitude), longitude: Number(f.longitude), radiusMeters: Number(f.radiusMeters) })
      setF({ name: '', latitude: '', longitude: '', radiusMeters: '100' }); setOpen(false); reload()
    } catch (e: any) { setErr(e.message) }
  }
  const active = data?.filter(l => l.active).length ?? 0
  return (<>
    <div className="lh-stats">
      <div className="lh-stat g"><span><IPin size={26} /></span><b>{active}</b><small>Active locations</small></div>
      <div className="lh-stat y"><span><IAim size={26} /></span><b>{data?.length ?? 0}</b><small>Locations in total</small></div>
    </div>
    <div className={`lc-state ${active > 0 ? 'on' : ''}`}>
      {active > 0 ? <><ICheckCircle size={20} /><span><b>Location check is on.</b> Punches outside every active location are flagged for your approval.</span></>
        : <><IAlert size={20} /><span><b>Location check is off.</b> With no active locations, where people punch from is not checked.</span></>}
    </div>

    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>Office locations</h3><p>Employees must be within the allowed distance of one of these places.</p></div>
        <button className="lh-add" onClick={() => setOpen(o => !o)}>{open ? 'Close' : '+ Add location'}</button></div>
      {open && <form className="lh-form lc-add" onSubmit={add}>
        <button type="button" className="lc-here" onClick={here} disabled={locating}><IAim size={20} />{locating ? 'Finding you…' : 'Use my current location'}</button>
        <div className="grid">
          <div><label htmlFor="location-f1">Name</label><input id="location-f1" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="e.g. Head office" /></div>
          <div><label htmlFor="location-f2">Latitude</label><input id="location-f2" value={f.latitude} onChange={e => setF({ ...f, latitude: e.target.value })} required placeholder="12.97160" /></div>
          <div><label htmlFor="location-f3">Longitude</label><input id="location-f3" value={f.longitude} onChange={e => setF({ ...f, longitude: e.target.value })} required placeholder="77.59460" /></div>
          <div><label htmlFor="location-f4">Allowed distance (m)</label><input id="location-f4" type="number" min="10" value={f.radiusMeters} onChange={e => setF({ ...f, radiusMeters: e.target.value })} required /></div>
        </div>
        {err && <div className="err">{err}</div>}
        <p style={{ marginBottom: 0 }}><button className="btn">Add location</button></p>
      </form>}
      {data?.length === 0 && !open && <div className="lh-empty"><IPin size={34} /><b>No locations yet</b><small>Add your office to start checking where people punch from.</small></div>}
      <div className="lh-types">{data?.map(l => <LocationCard key={`${l.id}-${l.name}-${l.radiusMeters}`} l={l} onSaved={reload} />)}</div>
    </section>
  </>)
}

/* ---------------- WiFi ---------------- */

export function Networks() {
  const { data, reload } = useLoad<any[]>('/api/hr/networks')
  const [f, setF] = useState({ name: '', cidr: '', bssid: '' })
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const useMine = async () => { try { const r = await get<{ ip: string }>('/api/hr/networks/my-ip'); setF(x => ({ ...x, cidr: r.ip, name: x.name || 'Office WiFi' })) } catch (e: any) { setErr(e.message) } }
  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await post('/api/hr/networks', f); setF({ name: '', cidr: '', bssid: '' }); setOpen(false); reload() } catch (e: any) { setErr(e.message) }
  }
  const active = data?.filter(n => n.active).length ?? 0
  return (<>
    <div className="lh-stats">
      <div className="lh-stat g"><span><IWifi size={26} /></span><b>{active}</b><small>Active networks</small></div>
      <div className="lh-stat y"><span><IAim size={26} /></span><b>{data?.length ?? 0}</b><small>Networks in total</small></div>
    </div>
    <div className={`lc-state ${active > 0 ? 'on' : ''}`}>
      {active > 0 ? <><ICheckCircle size={20} /><span><b>WiFi check is on.</b> Punches from other networks are flagged, and registering a phone from another network is held for approval.</span></>
        : <><IAlert size={20} /><span><b>WiFi check is off.</b> With no active network, WiFi is not checked.</span></>}
    </div>

    <section className="lh-sec">
      <div className="lh-sec-h"><div><h3>Office WiFi</h3><p>The check uses the office's public IP address (the router's).</p></div>
        <button className="lh-add" onClick={() => setOpen(o => !o)}>{open ? 'Close' : '+ Add network'}</button></div>
      <button className="lc-how" onClick={() => setHelp(h => !h)}>{help ? 'Hide' : 'How does this work?'}</button>
      {help && <div className="ap-note"><IAlert size={18} /><p>Browsers cannot read the WiFi name, so open this page <b>while connected to the office WiFi</b> and press “Use my current network”. The Android app can also match the access point (BSSID).</p></div>}
      {open && <form className="lh-form lc-add" onSubmit={add}>
        <button type="button" className="lc-here" onClick={useMine}><IWifi size={20} />Use my current network</button>
        <div className="grid">
          <div><label htmlFor="location-f5">Name</label><input id="location-f5" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="e.g. Office WiFi" /></div>
          <div><label htmlFor="location-f6">Public IP or range (CIDR)</label><input id="location-f6" value={f.cidr} placeholder="203.0.113.7 or 203.0.113.0/24" onChange={e => setF({ ...f, cidr: e.target.value })} /></div>
          <div><label htmlFor="location-f7">Access point BSSID (Android app)</label><input id="location-f7" value={f.bssid} placeholder="aa:bb:cc:dd:ee:ff" onChange={e => setF({ ...f, bssid: e.target.value })} /></div>
        </div>
        {err && <div className="err">{err}</div>}
        <p style={{ marginBottom: 0 }}><button className="btn">Add network</button></p>
      </form>}
      {data?.length === 0 && !open && <div className="lh-empty"><IWifi size={34} /><b>No networks yet</b><small>Add your office WiFi to flag punches from elsewhere.</small></div>}
      <div className="lh-types">
        {data?.map(n => (
          <div key={n.id} className={`lh-type lc-card${n.active ? '' : ' off'}`}>
            <div className="lh-type-top"><span className="lh-ic"><IWifi size={24} /></span><div className="lh-type-name"><b className="lc-nm">{n.name}</b><small>{n.active ? 'Checking this network' : 'Not checked'}</small></div></div>
            <div className="lc-kv"><small>IP / range</small><b>{n.cidr ?? '—'}</b></div>
            <div className="lc-kv"><small>BSSID</small><b>{n.bssid ?? '—'}</b></div>
            <div className="lh-toggles">
              <Toggle on={n.active} onLabel="Active" offLabel="Off" onClick={async () => { await put(`/api/hr/networks/${n.id}`, { active: !n.active }); reload() }} />
              <button className="lc-del" onClick={async () => { if (confirm(`Delete ${n.name}?`)) { await del(`/api/hr/networks/${n.id}`); reload() } }}><ITrash size={16} />Delete</button>
            </div>
          </div>))}
      </div>
    </section>
  </>)
}

