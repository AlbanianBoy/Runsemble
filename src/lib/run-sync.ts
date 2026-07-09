// ─── Offline run sync ─────────────────────────────────────────────────────────
// When a run is finished with no signal, its save can't reach the server. Rather
// than lose it, we stash the full save payload on the device and re-send it when
// the connection is back (on app open + the browser `online` event).
//
// The server dedupes on `clientRunId`, so draining the queue is idempotent: a
// retry that actually succeeded the first time (response lost to a flaky link)
// returns the existing run instead of recording a second one.

import { apiSend } from '@/lib/api'
import type { RunSaveResponse } from '@/lib/types'

// The exact body POSTed to /api/runs. clientRunId is required here (it's what
// makes re-sends safe); the rest mirrors the online save.
export interface PendingRun {
  clientRunId: string
  distanceKm: number
  durationSec: number
  hotspotId: string | null
  groupId: string | null
  companions: number
  buddyIds: string[]
  path: { lat: number; lng: number }[]
  splits: number[]
  rating: number | null
  shareToFeed: boolean
  queuedAt: number
}

const KEY = 'runsemble-pending-runs'

function read(): PendingRun[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as PendingRun[]) : []
  } catch {
    return []
  }
}

function write(runs: PendingRun[]): void {
  try {
    if (runs.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(runs))
  } catch {
    // storage unavailable — nothing we can do; the run stays in memory only
  }
}

/** Stash a run whose save couldn't reach the server. Dedupes on clientRunId. */
export function queuePendingRun(run: PendingRun): void {
  const runs = read()
  if (runs.some((r) => r.clientRunId === run.clientRunId)) return
  runs.push(run)
  write(runs)
}

export function pendingRunCount(): number {
  return read().length
}

// A network failure (offline) surfaces as a rejected fetch — a TypeError — not
// as a thrown Error from a non-2xx response. We keep the queue on network
// failures (try again later) but drop items the server actively rejects, so one
// malformed payload can't wedge the queue forever.
function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return e instanceof TypeError
}

let draining = false

/**
 * Try to upload every queued run, oldest first. Stops at the first network
 * failure (still offline) and leaves the remainder queued. Returns how many
 * runs were accepted by the server this pass. Safe to call repeatedly.
 */
export async function syncPendingRuns(): Promise<number> {
  if (draining) return 0
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
  const queue = read()
  if (queue.length === 0) return 0

  draining = true
  let synced = 0
  try {
    for (const run of queue) {
      try {
        await apiSend<RunSaveResponse>('/api/runs', 'POST', run)
        // Accepted (new or idempotent duplicate) — drop it from the queue.
        write(read().filter((r) => r.clientRunId !== run.clientRunId))
        synced++
      } catch (e) {
        if (isNetworkError(e)) break // still offline — keep the rest, retry later
        // Server rejected this payload (e.g. 400/409). It will never succeed;
        // drop it so it doesn't block the runs behind it.
        write(read().filter((r) => r.clientRunId !== run.clientRunId))
      }
    }
  } finally {
    draining = false
  }
  return synced
}
