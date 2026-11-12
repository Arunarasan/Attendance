import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordRequired from './ChangePasswordRequired'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setup() {
  const onDone = vi.fn()
  const onLogout = vi.fn()
  render(<ChangePasswordRequired name="Asha" onDone={onDone} onLogout={onLogout} />)
  return { onDone, onLogout, user: userEvent.setup() }
}

const fill = async (user: ReturnType<typeof userEvent.setup>, cur: string, next: string, again: string) => {
  await user.type(screen.getByLabelText('Current password'), cur)
  await user.type(screen.getByLabelText('New password'), next)
  await user.type(screen.getByLabelText('Repeat the new password'), again)
}

describe('ChangePasswordRequired', () => {
  it('greets the person and explains why', () => {
    setup()
    expect(screen.getByText(/Hello Asha/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeTruthy()
  })

  it('refuses two different new passwords without calling the server', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { user, onDone } = setup()
    await fill(user, 'old-password', 'brand-new-one', 'brand-new-two')
    await user.click(screen.getByRole('button', { name: /Save and continue/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('do not match')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('sends the change and then lets the app continue', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'CHANGED' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { user, onDone } = setup()
    await fill(user, 'old-password', 'brand-new-one', 'brand-new-one')
    await user.click(screen.getByRole('button', { name: /Save and continue/ }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/me/password')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'old-password', newPassword: 'brand-new-one' })
  })

  it('shows the server message and stays put when the change is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'BAD_PASSWORD', message: 'Current password is wrong' }), { status: 400 })))
    const { user, onDone } = setup()
    await fill(user, 'wrong-old', 'brand-new-one', 'brand-new-one')
    await user.click(screen.getByRole('button', { name: /Save and continue/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Current password is wrong')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('lets the person sign out instead', async () => {
    const { user, onLogout } = setup()
    await user.click(screen.getByText('Sign out'))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
