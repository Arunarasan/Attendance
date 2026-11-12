import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, fetchRemainingPages } from './api'

const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: from + i }))
const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers })

afterEach(() => vi.unstubAllGlobals())

describe('fetchRemainingPages', () => {
  it('collects every page until the total is reached', async () => {
    const doFetch = vi.fn(async (url: any) => {
      const offset = Number(new URL(String(url), 'http://x').searchParams.get('offset'))
      return json(rows(offset, Math.min(3, 8 - offset)))
    }) as unknown as typeof fetch
    const all = await fetchRemainingPages('/api/hr/employees', {}, rows(0, 3), 8, doFetch)
    expect(all.map(r => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect((doFetch as any).mock.calls.map((c: any) => c[0])).toEqual([
      '/api/hr/employees?limit=3&offset=3',
      '/api/hr/employees?limit=3&offset=6',
    ])
  })

  it('uses & when the path already has a query', async () => {
    const doFetch = vi.fn(async () => json(rows(2, 1))) as unknown as typeof fetch
    await fetchRemainingPages('/api/x?status=PENDING', {}, rows(0, 2), 3, doFetch)
    expect((doFetch as any).mock.calls[0][0]).toBe('/api/x?status=PENDING&limit=2&offset=2')
  })

  it('stops with what it has if the list shrinks while it is being read', async () => {
    const doFetch = vi.fn(async () => json([])) as unknown as typeof fetch
    const all = await fetchRemainingPages('/api/x', {}, rows(0, 2), 10, doFetch)
    expect(all).toHaveLength(2)
    expect((doFetch as any).mock.calls).toHaveLength(1)
  })

  it('reports a failed page instead of returning a partial list', async () => {
    const doFetch = vi.fn(async () => json({ message: 'no' }, {}, 500)) as unknown as typeof fetch
    await expect(fetchRemainingPages('/api/x', {}, rows(0, 2), 10, doFetch)).rejects.toThrow('Request failed (500)')
  })
})

describe('api() paging', () => {
  it('returns the whole list when the server says there is more than one page', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      const u = new URL(String(url), 'http://x')
      const offset = Number(u.searchParams.get('offset') ?? 0)
      return json(rows(offset, offset === 0 ? 4 : Math.min(4, 6 - offset)), { 'X-Total-Count': '6' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const data = await api<any[]>('GET', '/api/hr/employees')
    expect(data.map(r => r.id)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('does not page when the caller asked for a slice', async () => {
    const fetchMock = vi.fn(async () => json(rows(0, 2), { 'X-Total-Count': '9' }))
    vi.stubGlobal('fetch', fetchMock)
    const data = await api<any[]>('GET', '/api/hr/employees?limit=2&offset=0')
    expect(data).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves short lists and non-lists alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(rows(0, 2), { 'X-Total-Count': '2' })))
    expect(await api<any[]>('GET', '/api/x')).toHaveLength(2)
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true })))
    expect(await api('GET', '/api/me')).toEqual({ ok: true })
  })

  it('never pages a POST', async () => {
    const fetchMock = vi.fn(async () => json(rows(0, 2), { 'X-Total-Count': '9' }))
    vi.stubGlobal('fetch', fetchMock)
    await api('POST', '/api/hr/payroll/preview', {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
