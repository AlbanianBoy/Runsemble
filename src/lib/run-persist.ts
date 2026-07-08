// ─── In-progress run persistence ──────────────────────────────────────────────
// A run records in memory; if the app is killed mid-run (low memory, crash,
// force-close), that data is gone. We mirror it to the device as it records so
// the next open can recover it. localStorage is enough here — it survives app
// restarts in the WebView and is simple and synchronous.

export interface PersistedRun {
  startedAt: number
  updatedAt: number
  elapsedSec: number
  distanceKm: number
  splits: number[]
  routePoints: { lat: number; lng: number }[]
  points: { lat: number; lng: number; t: number }[]
  lastSplitElapsed: number
  context: { hotspotId?: string; groupId?: string; label?: string } | null
}

const KEY = 'runsemble-active-run'
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // recover runs from the last 6h, not older

export function saveActiveRun(run: PersistedRun): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(run))
  } catch {
    // storage full / unavailable — non-fatal; the run still records in memory
  }
}

export function loadActiveRun(): PersistedRun | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const run = JSON.parse(raw) as PersistedRun
    if (!run || typeof run.elapsedSec !== 'number' || !Array.isArray(run.routePoints)) return null
    if (Date.now() - (run.updatedAt || run.startedAt) > MAX_AGE_MS) {
      clearActiveRun()
      return null
    }
    return run
  } catch {
    return null
  }
}

export function clearActiveRun(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
