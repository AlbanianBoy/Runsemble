import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/password'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── Logging in ───────────────────────────────────────────────────────────────
// The login route is the front door, and its guarantees are the quiet kind: a
// refactor can drop one and every test still passes because the happy path is
// untouched. So they're spelled out here.
//
// Real hashing and the real limiter are used, not mocks. A mocked verifyPassword
// proves only that the mock was called; the point is that the actual scrypt
// comparison rejects the actual wrong password.

let overrides: DbOverrides = {}
const { db } = makeDb(
  new Proxy({} as DbOverrides, {
    get: (_t, k: string) => overrides[k],
    has: (_t, k: string) => k in overrides,
    ownKeys: () => Reflect.ownKeys(overrides),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })
)
vi.mock('@/lib/db', () => ({ db }))

// createSession writes a cookie, which needs a request scope we don't have here.
const createSession = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  createSession,
}))

const PASSWORD = 'correct-horse-battery'
const USER = {
  id: 'u1',
  name: 'Arian',
  email: 'arian@runsemble.app',
  passwordHash: hashPassword(PASSWORD),
}

// The limiter is in-memory and keyed by IP, so each test brings its own or they
// poison each other.
let ipCounter = 0
const login = (body: unknown, ip = `10.0.0.${++ipCounter}`) =>
  new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  })

beforeEach(() => {
  createSession.mockClear()
  overrides = { 'user.findUnique': () => USER }
})

describe('POST /api/auth/login', () => {
  it('signs in with the right password', async () => {
    const { POST } = await import('@/app/api/auth/login/route')
    const res = await POST(login({ email: USER.email, password: PASSWORD }))

    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith('u1')
  })

  it('never returns the password hash', async () => {
    const { POST } = await import('@/app/api/auth/login/route')
    const body = await (await POST(login({ email: USER.email, password: PASSWORD }))).json()

    expect(body.user.passwordHash).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain(USER.passwordHash)
  })

  it('rejects the wrong password and starts no session', async () => {
    const { POST } = await import('@/app/api/auth/login/route')
    const res = await POST(login({ email: USER.email, password: 'wrong' }))

    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  // The property worth protecting: an attacker must not be able to ask "does this
  // address have an account here?" and read the answer off the response. Identical
  // status AND identical wording, or the difference is the oracle.
  it('answers identically for an unknown email and a wrong password', async () => {
    const { POST } = await import('@/app/api/auth/login/route')

    const wrongPassword = await POST(login({ email: USER.email, password: 'wrong' }))
    overrides['user.findUnique'] = () => null
    const noSuchUser = await POST(login({ email: 'nobody@nowhere.com', password: 'wrong' }))

    expect(noSuchUser.status).toBe(wrongPassword.status)
    expect(await noSuchUser.json()).toEqual(await wrongPassword.json())
  })

  it('refuses an account with no password (seed/demo profiles) without crashing', async () => {
    overrides['user.findUnique'] = () => ({ ...USER, passwordHash: null })

    const { POST } = await import('@/app/api/auth/login/route')
    expect((await POST(login({ email: USER.email, password: PASSWORD }))).status).toBe(401)
  })

  it('requires both fields', async () => {
    const { POST } = await import('@/app/api/auth/login/route')

    expect((await POST(login({ email: USER.email }))).status).toBe(400)
    expect((await POST(login({ password: PASSWORD }))).status).toBe(400)
    expect((await POST(login({}))).status).toBe(400)
  })

  it('matches the email case-insensitively and ignores stray whitespace', async () => {
    let asked: string | undefined
    overrides['user.findUnique'] = (args: unknown) => {
      asked = (args as { where: { email: string } }).where.email
      return USER
    }

    const { POST } = await import('@/app/api/auth/login/route')
    await POST(login({ email: '  ARIAN@Runsemble.APP  ', password: PASSWORD }))

    expect(asked).toBe('arian@runsemble.app')
  })

  it('stops a password-guessing run from one address', async () => {
    const { POST } = await import('@/app/api/auth/login/route')
    const attacker = '203.0.113.7'

    // The limit is 10/min; the 11th attempt should be turned away.
    for (let i = 0; i < 10; i++) {
      const res = await POST(login({ email: USER.email, password: `guess-${i}` }, attacker))
      expect(res.status).toBe(401) // still answering, just wrongly guessed
    }
    expect((await POST(login({ email: USER.email, password: 'guess-11' }, attacker))).status).toBe(429)
  })

  it('does not punish a different address for that run', async () => {
    const { POST } = await import('@/app/api/auth/login/route')
    const attacker = '203.0.113.8'
    for (let i = 0; i < 11; i++) await POST(login({ email: USER.email, password: 'x' }, attacker))

    // A bystander behind a different IP is unaffected.
    const res = await POST(login({ email: USER.email, password: PASSWORD }, '198.51.100.4'))
    expect(res.status).toBe(200)
  })
})
