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

export async function startRecording(runId: string): Promise<void> {
  if (!isNative()) return
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
