/**
 * RunRecorder — Phase 2 native-owned run tracking.
 *
 * This is the JS wrapper for the custom Capacitor plugin defined in
 * native/run-recorder/src/definitions.ts.
 *
 * The web/browser path is 100% UNTOUCHED — this module is only active
 * when isRunRecorderSupported() returns true (i.e. on Android native).
 *
 * Current status: plugin is implemented natively. Wire in by:
 *   1. Registering the plugin (see capacitor.config.ts)
 *   2. Declaring the service in AndroidManifest.xml (see native/run-recorder/README.md)
 *   3. Switching run-tracker.tsx to use startTracking instead of startPositionWatch
 *      when isRunRecorderSupported() === true
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export interface RunPoint {
  t: number;
  lat: number;
  lng: number;
  acc?: number | null;
  provider?: string;
}

export interface ActiveSession {
  runId: string | null;
  startedAt?: number;
}

export interface GetTrackOptions {
  runId: string;
  sinceIndex?: number;
}

export interface GetTrackResult {
  points: RunPoint[];
  elapsedSec?: number;
  distanceKm?: number;
}

export interface RunRecorderPlugin {
  startTracking(options: { runId: string }): Promise<void>;
  stopTracking(): Promise<void>;
  getActiveSession(): Promise<ActiveSession>;
  getTrack(options: GetTrackOptions): Promise<GetTrackResult>;
  clearTrack(options: { runId: string }): Promise<void>;
}

const RunRecorder = registerPlugin<RunRecorderPlugin>('RunRecorder');

/**
 * Returns true when running in the Android native shell AND the
 * RunRecorder plugin is available. Always false in the browser.
 */
export function isRunRecorderSupported(): boolean {
  try {
    return Capacitor.isNativePlatform();
    // TODO: also probe the plugin once we have a no-op ping method
  } catch {
    return false;
  }
}

/**
 * Web fallback stub — throws immediately so callers know to use the
 * geo-watch.ts path instead.
 */
function webStub(): never {
  throw new Error(
    'RunRecorder is native-only. Use the web geolocation path (geo-watch.ts).'
  );
}

export const runRecorder = {
  async startTracking(options: { runId: string }): Promise<void> {
    if (!isRunRecorderSupported()) return webStub();
    return RunRecorder.startTracking(options);
  },

  async stopTracking(): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return RunRecorder.stopTracking();
  },

  async getActiveSession(): Promise<ActiveSession> {
    if (!isRunRecorderSupported()) return { runId: null };
    return RunRecorder.getActiveSession();
  },

  async getTrack(options: GetTrackOptions): Promise<GetTrackResult> {
    if (!isRunRecorderSupported()) return { points: [] };
    return RunRecorder.getTrack(options);
  },

  async clearTrack(options: { runId: string }): Promise<void> {
    if (!isRunRecorderSupported()) return;
    return RunRecorder.clearTrack(options);
  },
};

// Convenience re-export so run-tracker.tsx doesn't need two imports
export type { RunPoint as RecorderPoint };
