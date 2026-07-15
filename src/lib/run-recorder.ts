/**
 * RunRecorder — Phase 2 native-owned run tracking.
 *
 * JS wrapper for the custom Capacitor plugin defined in
 * native/run-recorder/src/definitions.ts.
 *
 * The web/browser path is 100% UNTOUCHED — this module is only
 * active when isRunRecorderSupported() returns true (Android native).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunPoint {
  t: number;
  lat: number;
  lng: number;
  acc?: number | null;
  provider?: string;
}

/** Legacy compact alias used by the old RecorderPoint interface in run-tracker.tsx */
export type RecorderPoint = RunPoint;

export interface ActiveSession {
  /** null when no run is active */
  runId: string | null;
  /** true when runId is non-null — kept for back-compat with run-tracker.tsx */
  active: boolean;
  startedAt?: number;
}

export interface GetTrackOptions {
  runId: string;
  sinceIndex?: number;
}

export interface GetTrackResult {
  points: RunPoint[];
  /** next index to pass as sinceIndex on the following poll */
  nextIndex: number;
  elapsedSec?: number;
  distanceKm?: number;
}

interface RunRecorderPlugin {
  startTracking(options: { runId: string }): Promise<void>;
  stopTracking(): Promise<void>;
  getActiveSession(): Promise<{ runId: string | null; startedAt?: number }>;
  getTrack(options: { runId: string; sinceIndex: number }): Promise<{ points: RunPoint[] }>;
  clearTrack(options: { runId: string }): Promise<void>;
}

const RunRecorder = registerPlugin<RunRecorderPlugin>('RunRecorder');

// ─── Support probe ────────────────────────────────────────────────────────────

/**
 * Sync check — returns true on Android native, false everywhere else.
 * Use this for branch decisions inside effects.
 */
export function isRunRecorderSupported(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Async overload kept for backward-compat with run-tracker.tsx which calls:
 *   const hasRecorder = await isRunRecorderSupported()
 * Resolves immediately — there is no async work here, just wraps the sync check.
 */
export async function isRunRecorderSupportedAsync(): Promise<boolean> {
  return isRunRecorderSupported();
}

// ─── New namespaced API (runRecorder.xxx) ─────────────────────────────────────

export const runRecorder = {
  async startTracking(options: { runId: string }): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return RunRecorder.startTracking(options);
  },

  async stopTracking(): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return RunRecorder.stopTracking();
  },

  async getActiveSession(): Promise<ActiveSession> {
    if (!isRunRecorderSupported()) return { runId: null, active: false };
    const r = await RunRecorder.getActiveSession();
    return { runId: r.runId ?? null, active: r.runId != null, startedAt: r.startedAt };
  },

  async getTrack(options: GetTrackOptions): Promise<GetTrackResult> {
    if (!isRunRecorderSupported()) return { points: [], nextIndex: options.sinceIndex ?? 0 };
    const r = await RunRecorder.getTrack({ runId: options.runId, sinceIndex: options.sinceIndex ?? 0 });
    const pts = r.points ?? [];
    return { points: pts, nextIndex: (options.sinceIndex ?? 0) + pts.length };
  },

  async clearTrack(options: { runId: string }): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return RunRecorder.clearTrack(options);
  },
};

// ─── Legacy flat exports (back-compat with run-tracker.tsx) ──────────────────
// run-tracker.tsx on main imports these names directly. Keep them as thin
// wrappers so no changes are needed in that file.

/** @deprecated Use runRecorder.startTracking instead */
export async function startRecording(runId: string): Promise<void> {
  return runRecorder.startTracking({ runId });
}

/** @deprecated Use runRecorder.stopTracking instead */
export async function stopRecording(): Promise<void> {
  return runRecorder.stopTracking();
}

/** @deprecated Use runRecorder.getActiveSession instead */
export async function getActiveSession(): Promise<ActiveSession> {
  return runRecorder.getActiveSession();
}

/**
 * @deprecated Use runRecorder.getTrack instead.
 * Returns { points, nextIndex } matching the shape run-tracker.tsx expects.
 */
export async function getTrack(
  runId: string,
  sinceIndex: number,
): Promise<{ points: RunPoint[]; nextIndex: number }> {
  return runRecorder.getTrack({ runId, sinceIndex });
}

/** @deprecated Use runRecorder.clearTrack instead */
export async function clearRecording(runId: string): Promise<void> {
  return runRecorder.clearTrack({ runId });
}
