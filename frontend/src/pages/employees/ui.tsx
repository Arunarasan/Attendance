import { cloneElement, isValidElement, ReactElement, ReactNode, useCallback, useEffect, useId, useState } from 'react'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="overlay right" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="drawer" role="dialog" aria-modal="true">{children}</aside>
    </div>
  )
}

export function Modal({ onClose, small, children }: { onClose: () => void; small?: boolean; children: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="overlay center" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${small ? ' small' : ''}`} role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

export function Confirm({ title, body, confirmLabel, danger, onYes, onNo }:
  { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <Modal small onClose={onNo}>
      <h2>{title}</h2>
      <div className="muted">{body}</div>
      <div className="actions">
        <button className={`btn${danger ? ' danger' : ''}`} onClick={onYes}>{confirmLabel}</button>
        <button className="btn ghost" onClick={onNo}>Cancel</button>
      </div>
    </Modal>
  )
}

export type Toast = { id: number; text: string; bad?: boolean }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, bad = false) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, text, bad }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), bad ? 6000 : 3500)
  }, [])
  const view = <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`}>{t.text}</div>)}</div>
  return { push, view }
}

export function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children}
      {error ? <div className="ferr">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

export function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const buf = new Uint32Array(12)
  crypto.getRandomValues(buf)
  return Array.from(buf, n => chars[n % chars.length]).join('')
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export const METHOD_LABEL: Record<string, string> = { GEO: 'Phone + location', OFFICE_DEVICE: 'Office kiosk', ANY: 'Either' }
export const BINDING_LABEL: Record<string, string> = { OFF: 'Off', SOFT: 'Soft', HARD: 'Hard' }

export type Emp = {
  id: number; employeeCode: string; name: string; email: string; phone: string; role: string; active: boolean
  hourlyRate: number; baseSalary: number; attendanceMethod: string; deviceBindingMode: string | null
  faceEnrolled: boolean; appPaired: boolean; phoneApproved: boolean
}
