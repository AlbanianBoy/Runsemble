// ─── RunRecorder (Phase 2) ───────────────────────────────────────────────────
// Typed JS surface over the native RunRecorder plugin (Android). The native
// *started* foreground service owns the run and writes every fix to disk as it
// lands; JS just starts/stops it and reads the durable track incrementally. This
// makes a valid GPS fix survive WebView freeze, backgrounding, and app kill — the
// authoritative run track is on disk, not in JS/localStorage.
//
// Web and un-patched native builds have no RunRecorder — callers must probe
// isRunRecorderSupported() and fall back to the geo-watch path.

import { Capacitor, registerPlugin } from '@capacitor/core'

// A single fix as persisted natively (compact keys keep the JSONL small).
export interface RecorderPoint {
  t: number
  lat: number
  lng: number
  acc: number | null
  p: string // provider: "fused" | "gps"
}

export interface ActiveSession {
  active: boolean
  runId?: string
  startedAt?: number
  updatedAt?: number
  count?: number
}

interface RunRecorderPlugin {
  isAvailable(): Promise<{ available: boolean }>
  // Capacitor routes this through the @Permission aliases on the plugin annotation.
  // permissions: ['location'] → COARSE + FINE (standard dialog)
  // permissions: ['backgroundLocation'] → ACCESS_BACKGROUND_LOCATION ("Allow all the time")
  requestPermissions(o: { permissions: string[] }): Promise<{ location: string; backgroundLocation: string }>
  startTracking(o: { runId: string }): Promise<void>
  stopTracking(): Promise<void>
  getActiveSession(): Promise<ActiveSession>
  getTrack(o: { runId: string; sinceIndex: number }): Promise<{ points: RecorderPoint[]; nextIndex: number }>
  clearTrack(o: { runId: string }): Promise<void>
}

const RunRecorder = registerPlugin<RunRecorderPlugin>('RunRecorder')

function isNative(): boolean {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

// Does the installed native build actually have RunRecorder? (JS reaches a phone
// via the web ahead of the native rebuild, so we must probe before switching off
// the old geo-watch path.)
export async function isRunRecorderSupported(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const r = await RunRecorder.isAvailable()
    return !!r.available
  } catch {
    return false
  }
}

// Request foreground location first, then background location as the mandatory
// Android two-step. Android will not show the "Allow all the time" prompt unless
// the foreground grant already exists. Safe to call repeatedly — the OS is a
// no-op once already granted.
export async function requestBackgroundLocation(): Promise<void> {
  if (!isNative()) return
  try {
    // Step 1: foreground (COARSE + FINE) — standard location dialog.
    await RunRecorder.requestPermissions({ permissions: ['location'] })
    // Step 2: background — Android 11+ redirects to Settings with
    // "Allow all the time" pre-highlighted; Android 10 shows it inline.
    await RunRecorder.requestPermissions({ permissions: ['backgroundLocation'] })
  } catch {
    // Permission denied or old build without the alias — fall through silently.
  }
}

export async function startRecording(runId: string): Promise<void> {
  if (!isNative()) return
  // Always do the two-step permission request before starting the service so the
  // user gets the "Allow all the time" prompt before the run begins rather than
  // silently losing GPS the moment the screen turns off.
  await requestBackgroundLocation()
  await RunRecorder.startTracking({ runId })
}

export async function stopRecording(): Promise<void> {
  if (!isNative()) return
  try { await RunRecorder.stopTracking() } catch { /* no-op */ }
}

export async function getActiveSession(): Promise<ActiveSession> {
  if (!isNative()) return { active: false }
  try { return await RunRecorder.getActiveSession() } catch { return { active: false } }
}

// Pull persisted fixes from a line index onward. Returns the points and the next
// index to poll from, so the caller streams the durable track incrementally.
export async function getTrack(runId: string, sinceIndex: number): Promise<{ points: RecorderPoint[]; nextIndex: number }> {
  if (!isNative()) return { points: [], nextIndex: sinceIndex }
  try {
    const r = await RunRecorder.getTrack({ runId, sinceIndex })
    return { points: r.points ?? [], nextIndex: r.nextIndex ?? sinceIndex }
  } catch {
    return { points: [], nextIndex: sinceIndex }
  }
}

export async function clearRecording(runId: string): Promise<void> {
  if (!isNative()) return
  try { await RunRecorder.clearTrack({ runId }) } catch { /* no-op */ }
}
