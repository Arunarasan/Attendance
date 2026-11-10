export type Auth = { kind: 'jwt' | 'device'; token: string }

const KEY = 'attendance.auth'

export function getAuth(): Auth | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Auth) : null
  } catch {
    return null
  }
}

export function setAuth(a: Auth | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable (private mode): session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const auth = getAuth()
  if (auth) {
    if (auth.kind === 'jwt') headers['Authorization'] = `Bearer ${auth.token}`
    else headers['X-Device-Token'] = auth.token
  }
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    if (res.status === 401 && auth && !path.startsWith('/api/public')) {
      setAuth(null)
      window.dispatchEvent(new Event('auth-lost'))
    }
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? `Request failed (${res.status})`)
  }
  return data as T
}

/** Fetches a protected binary (such as a photo) with the sign-in header and returns an object URL for <img src>. */
export async function blobUrl(path: string): Promise<string> {
  const auth = getAuth()
  const headers: Record<string, string> = {}
  if (auth) headers[auth.kind === 'jwt' ? 'Authorization' : 'X-Device-Token'] = auth.kind === 'jwt' ? `Bearer ${auth.token}` : auth.token
  const res = await fetch(path, { headers })
  if (!res.ok) throw new ApiError(res.status, 'ERROR', `Request failed (${res.status})`)
  return URL.createObjectURL(await res.blob())
}

export const get = <T = any>(p: string) => api<T>('GET', p)
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {})
export const del = <T = any>(p: string) => api<T>('DELETE', p)
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {})

export function fmtTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
}
export function fmtDateTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}
export function fmtHours(minutes?: number | null) {
  if (minutes == null) return '—'
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
