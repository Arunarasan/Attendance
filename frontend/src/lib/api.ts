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
  constructor(public status: number, public code: string, message: string, public data?: any) {
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
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? `Request failed (${res.status})`, data)
  }
  // The server returns at most one page of a long list and reports the full size in X-Total-Count. Fetch the remaining pages so
  // no screen silently shows only the first page (for example the employee dropdowns of a large company).
  if (method === 'GET' && Array.isArray(data) && !/[?&](limit|offset)=/.test(path)) {
    const total = Number(res.headers.get('X-Total-Count'))
    if (total > data.length) return (await fetchRemainingPages(path, headers, data, total)) as T
  }
  return data as T
}

/** Follows ?limit=&offset= until `total` rows are collected. Exported for tests. */
export async function fetchRemainingPages(path: string, headers: Record<string, string>, first: any[], total: number, doFetch: typeof fetch = fetch): Promise<any[]> {
  const all = [...first]
  const sep = path.includes('?') ? '&' : '?'
  while (all.length < total) {
    const res = await doFetch(`${path}${sep}limit=${Math.max(first.length, 1)}&offset=${all.length}`, { method: 'GET', headers })
    if (!res.ok) throw new ApiError(res.status, 'ERROR', `Request failed (${res.status})`)
    const page = JSON.parse(await res.text())
    if (!Array.isArray(page) || page.length === 0) break // the list shrank while we were reading: stop with what we have
    all.push(...page)
  }
  return all
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
