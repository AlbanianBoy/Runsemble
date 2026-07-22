import { describe, it, expect } from 'vitest'
import { createBackoffState, nextPollInterval, type BackoffState } from '@/lib/use-visible-poll'

// The notification bell polls on every screen, so it dominates a signed-in
// user's steady-state request rate. These are the rules that decide when it is
// allowed to slow down — and, more importantly, that it always speeds back up.

const BASE = 20_000
const SLOW = 60_000 // BASE * BACKOFF_FACTOR

/** Simulate a fetch that returned `data`, at a new timestamp. */
function fetched(state: BackoffState, data: unknown, at: number, visible = true) {
  return nextPollInterval(state, { data, dataUpdatedAt: at }, BASE, visible)
}

describe('idle poll backoff', () => {
  it('polls at the base interval while data keeps changing', () => {
    const s = createBackoffState()
    expect(fetched(s, { n: 1 }, 1)).toBe(BASE)
    expect(fetched(s, { n: 2 }, 2)).toBe(BASE)
    expect(fetched(s, { n: 3 }, 3)).toBe(BASE)
    expect(fetched(s, { n: 4 }, 4)).toBe(BASE)
  })

  it('slows down only after several fetches bring back nothing new', () => {
    const s = createBackoffState()
    const same = { unread: 0 }
    expect(fetched(s, same, 1)).toBe(BASE) // first observation — no baseline yet
    expect(fetched(s, same, 2)).toBe(BASE) // quiet 1
    expect(fetched(s, same, 3)).toBe(BASE) // quiet 2
    expect(fetched(s, same, 4)).toBe(SLOW) // quiet 3 — back off
    expect(fetched(s, same, 5)).toBe(SLOW)
  })

  it('returns to full speed the instant anything changes', () => {
    // The asymmetry is the point: slow to back off, instant to recover, so a
    // quiet hour is cheap and the first thing that happens is still seen fast.
    const s = createBackoffState()
    const same = { unread: 0 }
    for (let i = 1; i <= 5; i++) fetched(s, same, i)
    expect(fetched(s, same, 6)).toBe(SLOW)
    expect(fetched(s, { unread: 1 }, 7)).toBe(BASE)
  })

  it('treats a deeply-equal-but-new reference as a change', () => {
    // Structural sharing means TanStack hands back the SAME reference when data
    // is unchanged. A new reference therefore means it really did change, even
    // if it happens to look similar.
    const s = createBackoffState()
    for (let i = 1; i <= 5; i++) fetched(s, { unread: 0 }, i)
    expect(fetched(s, { unread: 0 }, 6)).toBe(BASE)
  })

  it('does not count renders as polls', () => {
    // Consulted on every render too. Only a moved dataUpdatedAt is a fetch.
    const s = createBackoffState()
    const same = { unread: 0 }
    fetched(s, same, 1)
    for (let i = 0; i < 50; i++) nextPollInterval(s, { data: same, dataUpdatedAt: 1 }, BASE, true)
    expect(fetched(s, same, 2)).toBe(BASE) // still only the first quiet poll
  })

  it('stops entirely while the document is hidden', () => {
    const s = createBackoffState()
    expect(fetched(s, { n: 1 }, 1, false)).toBe(false)
  })

  it('keeps counting while hidden so a long background stretch resumes slow', () => {
    // Coming back to a tab that was quiet for an hour should not reset the
    // counter — nothing happened while it was away, and refetchOnWindowFocus
    // already fires an immediate fetch, so freshness does not depend on this.
    const s = createBackoffState()
    const same = { unread: 0 }
    for (let i = 1; i <= 5; i++) fetched(s, same, i, false)
    expect(fetched(s, same, 6, true)).toBe(SLOW)
  })

  it('scales the slow interval from whatever base it was given', () => {
    const s = createBackoffState()
    const same = { x: 1 }
    for (let i = 1; i <= 5; i++) nextPollInterval(s, { data: same, dataUpdatedAt: i }, 15_000, true)
    expect(nextPollInterval(s, { data: same, dataUpdatedAt: 6 }, 15_000, true)).toBe(45_000)
  })

  it('never mistakes the very first fetch for a quiet one', () => {
    // lastData starts as undefined; a query whose data is legitimately
    // undefined must not look identical to it and skip a beat.
    const s = createBackoffState()
    expect(fetched(s, undefined, 1)).toBe(BASE)
    expect(s.quietPolls).toBe(0)
  })
})
