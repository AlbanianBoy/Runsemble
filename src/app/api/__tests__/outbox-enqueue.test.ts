// Tests for src/lib/outbox.ts
// Verifies that enqueueNotification writes to notificationOutbox inside a
// transaction and that the self-notification guard is respected.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeDb } from './helpers/mock-db'

vi.mock('@/lib/db', () => ({ db: makeDb().db }))

// Import AFTER the mock is in place.
const { enqueueNotification } = await import('@/lib/outbox')

describe('enqueueNotification', () => {
  let tx: ReturnType<typeof makeDb>['db']
  let calls: string[]

  beforeEach(() => {
    const mock = makeDb()
    tx = mock.db
    calls = mock.calls
  })

  it('writes a notificationOutbox row with the spec serialised as JSON', async () => {
    let capturedData: unknown
    const mock = makeDb({
      'notificationOutbox.create': (args: unknown) => {
        capturedData = (args as { data: unknown }).data
        return { id: 'out-1' }
      },
    })
    tx = mock.db

    await enqueueNotification(tx, {
      userId: 'user-b',
      actorId: 'user-a',
      type: 'run_invite',
      title: 'Alice ran with you',
      body: "You're now run buddies!",
      entityId: 'user-a',
      icon: '🤝',
    })

    expect(capturedData).toMatchObject({
      payload: expect.stringContaining('run_invite'),
    })
    // Payload must be valid JSON containing the original spec fields.
    const parsed = JSON.parse((capturedData as { payload: string }).payload)
    expect(parsed.userId).toBe('user-b')
    expect(parsed.actorId).toBe('user-a')
    expect(parsed.type).toBe('run_invite')
  })

  it('does NOT write a row when actorId === userId (self-notification guard)', async () => {
    const mock = makeDb()
    tx = mock.db
    calls = mock.calls

    await enqueueNotification(tx, {
      userId: 'user-a',
      actorId: 'user-a', // same person
      type: 'run_invite',
      title: 'You ran with yourself',
    })

    expect(calls).not.toContain('notificationOutbox.create')
  })

  it('writes a row when there is no actorId (system notification)', async () => {
    let wrote = false
    const mock = makeDb({
      'notificationOutbox.create': () => { wrote = true; return { id: 'out-2' } },
    })
    tx = mock.db

    await enqueueNotification(tx, {
      userId: 'user-b',
      type: 'run_complete',
      title: 'You ran 5 km',
    })

    expect(wrote).toBe(true)
  })
})
