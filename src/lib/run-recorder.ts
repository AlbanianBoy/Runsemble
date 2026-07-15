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

/** Legacy alias kept for back-compat with run-tracker.tsx */
export type RecorderPoint = RunPoint;

export interface ActiveSession {
  runId: string | null;
  /** true when runId is non-null — kept for back-compat */
  active: boolean;
  startedAt?: number;
}

export interface GetTrackOptions {
  runId: string;
  sinceIndex?: number;
}

export interface GetTrackResult {
  points: RunPoint[];
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

// ─── Lazy singleton ───────────────────────────────────────────────────────────
// registerPlugin must NOT be called at module-load time: Next.js evaluates
// this module on the server (SSR) AND in the browser bundle, which causes
// Capacitor to throw "plugin already registered". We defer the call to the
// first actual use, guarded by a typeof-window check so it never runs SSR.

let _plugin: RunRecorderPlugin | null = null;

function getPlugin(): RunRecorderPlugin {
  if (!_plugin) {
    if (typeof window === 'undefined') {
      // SSR — return a no-op stub so imports don't crash on the server
      _plugin = {
        startTracking: async () => {},
        stopTracking:  async () => {},
        getActiveSession: async () => ({ runId: null }),
        getTrack: async () => ({ points: [] }),
        clearTrack: async () => {},
      } as unknown as RunRecorderPlugin;
    } else {
      _plugin = registerPlugin<RunRecorderPlugin>('RunRecorder');
    }
  }
  return _plugin;
}

// ─── Support probe ────────────────────────────────────────────────────────────

/** Returns true on Android native, false everywhere else (including SSR). */
export function isRunRecorderSupported(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// ─── Namespaced API ───────────────────────────────────────────────────────────

export const runRecorder = {
  async startTracking(options: { runId: string }): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return getPlugin().startTracking(options);
  },

  async stopTracking(): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return getPlugin().stopTracking();
  },

  async getActiveSession(): Promise<ActiveSession> {
    if (!isRunRecorderSupported()) return { runId: null, active: false };
    const r = await getPlugin().getActiveSession();
    return { runId: r.runId ?? null, active: r.runId != null, startedAt: r.startedAt };
  },

  async getTrack(options: GetTrackOptions): Promise<GetTrackResult> {
    if (!isRunRecorderSupported()) return { points: [], nextIndex: options.sinceIndex ?? 0 };
    const r = await getPlugin().getTrack({ runId: options.runId, sinceIndex: options.sinceIndex ?? 0 });
    const pts = r.points ?? [];
    return { points: pts, nextIndex: (options.sinceIndex ?? 0) + pts.length };
  },

  async clearTrack(options: { runId: string }): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return getPlugin().clearTrack(options);
  },
};

// ─── Legacy flat exports (back-compat with run-tracker.tsx) ──────────────────

/** @deprecated Use runRecorder.startTracking */
export async function startRecording(runId: string): Promise<void> {
  return runRecorder.startTracking({ runId });
}

/** @deprecated Use runRecorder.stopTracking */
export async function stopRecording(): Promise<void> {
  return runRecorder.stopTracking();
}

/** @deprecated Use runRecorder.getActiveSession */
export async function getActiveSession(): Promise<ActiveSession> {
  return runRecorder.getActiveSession();
}

/** @deprecated Use runRecorder.getTrack */
export async function getTrack(
  runId: string,
  sinceIndex: number,
): Promise<{ points: RunPoint[]; nextIndex: number }> {
  return runRecorder.getTrack({ runId, sinceIndex });
}

/** @deprecated Use runRecorder.clearTrack */
export async function clearRecording(runId: string): Promise<void> {
  return runRecorder.clearTrack({ runId });
}
