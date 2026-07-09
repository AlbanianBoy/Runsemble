import { describe, it, expect, beforeEach, vi } from 'vitest'

// apiSend is the only outward call the sync module makes — mock it so we can
// drive success / offline / server-reject outcomes deterministically.
const apiSend = vi.fn()
vi.mock('@/lib/api', () => ({ apiSend: (...args: unknown[]) => apiSend(...args) }))

import { queuePendingRun, pendingRunCount, syncPendingRuns, type PendingRun } from '@/lib/run-sync'

// Minimal localStorage for the node test env.
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

function run(id: string): PendingRun {
  return {
    clientRunId: id,
    distanceKm: 5, durationSec: 1500,
    hotspotId: null, groupId: null,
    companions: 0, buddyIds: [], path: [], splits: [],
    rating: null, shareToFeed: true, queuedAt: Date.now(),
  }
}

// A rejected fetch (offline) surfaces as a TypeError, which is how the module
// distinguishes "try again later" from "the server said no".
const offlineError = () => new TypeError('Failed to fetch')

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage())
  vi.stubGlobal('navigator', { onLine: true })
  apiSend.mockReset()
})

describe('run-sync queue', () => {
  it('queues runs and reports the count', () => {
    expect(pendingRunCount()).toBe(0)
    queuePendingRun(run('a'))
    queuePendingRun(run('b'))
    expect(pendingRunCount()).toBe(2)
  })

  it('does not queue the same clientRunId twice', () => {
    queuePendingRun(run('a'))
    queuePendingRun(run('a'))
    expect(pendingRunCount()).toBe(1)
  })
})

describe('syncPendingRuns', () => {
  it('uploads every queued run and empties the queue on success', async () => {
    apiSend.mockResolvedValue({ session: {} })
    queuePendingRun(run('a'))
    queuePendingRun(run('b'))

    const synced = await syncPendingRuns()

    expect(synced).toBe(2)
    expect(apiSend).toHaveBeenCalledTimes(2)
    expect(pendingRunCount()).toBe(0)
  })

  it('keeps runs queued and stops at the first offline failure', async () => {
    // First upload succeeds, second hits a dropped connection.
    apiSend.mockResolvedValueOnce({ session: {} }).mockRejectedValueOnce(offlineError())
    queuePendingRun(run('a'))
    queuePendingRun(run('b'))
    queuePendingRun(run('c'))

    const synced = await syncPendingRuns()

    expect(synced).toBe(1)            // only 'a' got through
    expect(apiSend).toHaveBeenCalledTimes(2) // stopped after 'b' failed; 'c' not attempted
    expect(pendingRunCount()).toBe(2) // 'b' and 'c' remain for the next attempt
  })

  it('does nothing (no network calls) while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    queuePendingRun(run('a'))

    const synced = await syncPendingRuns()

    expect(synced).toBe(0)
    expect(apiSend).not.toHaveBeenCalled()
    expect(pendingRunCount()).toBe(1) // still queued for when we're back online
  })

  it('drops a run the server actively rejects so it cannot wedge the queue', async () => {
    // A non-network Error = the server returned a 4xx (e.g. bad payload). That
    // will never succeed, so it must be discarded, and the run behind it synced.
    apiSend.mockRejectedValueOnce(new Error('Request failed (400)')).mockResolvedValueOnce({ session: {} })
    queuePendingRun(run('poison'))
    queuePendingRun(run('good'))

    const synced = await syncPendingRuns()

    expect(synced).toBe(1)            // 'good' uploaded
    expect(apiSend).toHaveBeenCalledTimes(2) // poison attempted then dropped, good attempted
    expect(pendingRunCount()).toBe(0) // both gone from the queue
  })

  it('is a no-op with an empty queue', async () => {
    const synced = await syncPendingRuns()
    expect(synced).toBe(0)
    expect(apiSend).not.toHaveBeenCalled()
  })
})
