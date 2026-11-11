import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { getAuth, get, setAuth } from './lib/api'
import Login from './pages/Login'
import Portal from './pages/Portal'
import Hr from './pages/Hr'
import Kiosk from './pages/Kiosk'
import AppPair from './pages/AppPair'
import FacePunch from './pages/FacePunch'
import LoadingScreen from './components/LoadingScreen'

export type Me = { id: number; name: string; role: string; employeeCode: string }

function Shell() {
  const nav = useNavigate()
  const [me, setMe] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)

  const load = () => {
    if (!getAuth()) { setMe(null); setReady(true); return }
    get<Me>('/api/me').then(setMe).catch(() => setMe(null)).finally(() => setReady(true))
  }
  useEffect(() => {
    load()
    const lost = () => { setMe(null); nav('/login') }
    window.addEventListener('auth-lost', lost)
    return () => window.removeEventListener('auth-lost', lost)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) return <LoadingScreen />
  const isHr = me?.role === 'HR' || me?.role === 'ADMIN'
  // Not signed in: go to the sign-in page (face punch is a button there). Signed in: straight to home, no sign-in again.
  const loginPath = '/login'
  const logout = () => { setAuth(null); setMe(null); nav(loginPath) }

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to={isHr ? '/hr' : '/'} /> : <Login onDone={() => { load(); }} />} />
      <Route path="/punch" element={<FacePunch />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/app/pair" element={me ? <Navigate to="/" /> : <AppPair onDone={load} />} />
      <Route path="/hr/*" element={me ? (isHr ? <Hr me={me} onLogout={logout} /> : <Navigate to="/" />) : <Navigate to={loginPath} />} />
      <Route path="/*" element={me ? (isHr && window.location.pathname === '/' ? <Navigate to="/hr" /> : <Portal me={me} onLogout={logout} />) : <Navigate to={loginPath} />} />
    </Routes>
  )
}

export default function App() {
  return <Shell />
}
