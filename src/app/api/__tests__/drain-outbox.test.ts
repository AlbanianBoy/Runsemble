// Tests for src/app/api/cron/drain-outbox/route.ts
// Verifies auth guard, happy-path delivery, retry backoff, and abandonment.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeDb } from './helpers/mock-db'
import type { TxClient } from '@/lib/outbox'

// ─ mocks ─────────────────────────────────────────────────────────────────────────
const mockNotify = vi.fn(async () => {})
vi.mock('@/lib/notify', () => ({ notify: mockNotify }))

// ─ db indirection ──────────────────────────────────────────────────────────────
// vi.doMock() after a top-level `await import` is inert — the module is already
// bound. Instead we keep a mutable reference and point the mock factory at it.
// Each test swaps `activeDb` before calling GET, so the route always reads the
// db that was live when the call happened.
let activeDb: TxClient = makeDb().db
vi.mock('@/lib/db', () => ({ get db() { return activeDb } }))

// Import AFTER mocks are registered.
const { GET } = await import('@/app/api/cron/drain-outbox/route')

// Helper: build a minimal Request with optional Authorization header.
function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/drain-outbox', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

const VALID_SECRET = 'test-secret'

beforeEach(() => {
  vi.resetAllMocks()
  process.env.CRON_SECRET = VALID_SECRET
  // Reset to a fresh empty db so tests don't bleed into each other.
  activeDb = makeDb().db
})

describe('GET /api/cron/drain-outbox', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization header has wrong secret', async () => {
    const res = await GET(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 200 with delivered=0 when the outbox is empty', async () => {
    // activeDb default: findMany returns []
    const res = await GET(makeRequest(VALID_SECRET))
    expect(res.status).toBe(200)
    const body = await res.json() as { delivered: number; failed: number; total: number }
    expect(body.total).toBe(0)
    expect(body.delivered).toBe(0)
  })

  it('marks a row delivered when notify() succeeds', async () => {
    const row = {
      id: 'out-1',
      payload: JSON.stringify({ userId: 'u2', actorId: 'u1', type: 'run_invite', title: 'hi' }),
      attempts: 0,
      createdAt: new Date(),
      deliveredAt: null,
      nextAttemptAt: null,
    }
    let updatedData: unknown
    activeDb = makeDb({
      'notificationOutbox.findMany': () => [row],
      'notificationOutbox.update': (args: unknown) => {
        updatedData = (args as { data: unknown }).data
        return row
      },
    }).db
    mockNotify.mockResolvedValueOnce(undefined)

    const res = await GET(makeRequest(VALID_SECRET))
    expect(res.status).toBe(200)
    const body = await res.json() as { delivered: number }
    expect(body.delivered).toBe(1)
    // The update must set deliveredAt, not just increment attempts.
    expect(updatedData).toMatchObject({ deliveredAt: expect.any(Date) })
  })

  it('schedules a retry with backoff when notify() throws', async () => {
    const row = {
      id: 'out-2',
      payload: JSON.stringify({ userId: 'u2', actorId: 'u1', type: 'run_invite', title: 'hi' }),
      attempts: 0,
      createdAt: new Date(),
      deliveredAt: null,
      nextAttemptAt: null,
    }
    let updatedData: unknown
    activeDb = makeDb({
      'notificationOutbox.findMany': () => [row],
      'notificationOutbox.update': (args: unknown) => {
        updatedData = (args as { data: unknown }).data
        return row
      },
    }).db
    mockNotify.mockRejectedValueOnce(new Error('FCM down'))

    const res = await GET(makeRequest(VALID_SECRET))
    expect(res.status).toBe(200)
    const body = await res.json() as { failed: number }
    expect(body.failed).toBe(1)
    // deliveredAt must NOT be set; nextAttemptAt must be a future date.
    expect((updatedData as { deliveredAt?: unknown }).deliveredAt).toBeUndefined()
    expect((updatedData as { nextAttemptAt?: unknown }).nextAttemptAt).toBeInstanceOf(Date)
  })

  it('abandons a row after MAX_ATTEMPTS without setting deliveredAt', async () => {
    const row = {
      id: 'out-3',
      payload: JSON.stringify({ userId: 'u2', type: 'run_invite', title: 'hi' }),
      attempts: 2, // already tried twice — next failure hits MAX_ATTEMPTS
      createdAt: new Date(),
      deliveredAt: null,
      nextAttemptAt: null,
    }
    let updatedData: unknown
    activeDb = makeDb({
      'notificationOutbox.findMany': () => [row],
      'notificationOutbox.update': (args: unknown) => {
        updatedData = (args as { data: unknown }).data
        return row
      },
    }).db
    mockNotify.mockRejectedValueOnce(new Error('still down'))

    await GET(makeRequest(VALID_SECRET))
    // nextAttemptAt should be null: no further retry is scheduled.
    expect((updatedData as { nextAttemptAt?: unknown }).nextAttemptAt).toBeNull()
    expect((updatedData as { deliveredAt?: unknown }).deliveredAt).toBeUndefined()
  })

  it('abandons a row with unparseable payload immediately', async () => {
    const row = {
      id: 'out-4',
      payload: 'NOT_JSON{{{',
      attempts: 0,
      createdAt: new Date(),
      deliveredAt: null,
      nextAttemptAt: null,
    }
    let updatedAttempts: number | undefined
    activeDb = makeDb({
      'notificationOutbox.findMany': () => [row],
      'notificationOutbox.update': (args: unknown) => {
        updatedAttempts = (args as { data: { attempts: number } }).data.attempts
        return row
      },
    }).db

    await GET(makeRequest(VALID_SECRET))
    // Should be set to MAX_ATTEMPTS (3) to stop future retries.
    expect(updatedAttempts).toBe(3)
    expect(mockNotify).not.toHaveBeenCalled()
  })
})
