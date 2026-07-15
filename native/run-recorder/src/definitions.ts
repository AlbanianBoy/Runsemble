/**
 * RunRecorder Plugin — TypeScript contract (Phase 2).
 *
 * Matches the spec in docs/tracking-endgame-plan.md.
 * The native Android implementation must honour these signatures exactly.
 */

export interface RunPoint {
  /** GPS timestamp — ms since epoch (the real fix time, not Date.now()) */
  t: number;
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres, if the OS reported it */
  acc?: number | null;
  /** 'fused' | 'gps' | 'network' — whichever provider delivered this fix */
  provider?: string;
}

export interface ActiveSession {
  /** null when no run is currently being recorded */
  runId: string | null;
  /** ms since epoch — when startTracking was called */
  startedAt?: number;
}

export interface GetTrackOptions {
  runId: string;
  /**
   * Return only points at or after this 0-based index.
   * Omit (or pass 0) to get all points.
   * Use the length of the last returned array as the next sinceIndex.
   */
  sinceIndex?: number;
}

export interface GetTrackResult {
  points: RunPoint[];
  /** Optional — native can expose cheap live values for the notification */
  elapsedSec?: number;
  distanceKm?: number;
}

export interface RunRecorderPlugin {
  /** Create the JSONL file and start the foreground service. */
  startTracking(options: { runId: string }): Promise<void>;

  /** Stop collecting, release wake lock, dismiss notification. */
  stopTracking(): Promise<void>;

  /**
   * Returns the run that is currently being recorded, if any.
   * Call this on cold launch to re-attach to an interrupted run.
   */
  getActiveSession(): Promise<ActiveSession>;

  /**
   * Primary way JS consumes the track on native in Phase 2.
   * Poll every 2 s on resume; pass last array length as sinceIndex.
   */
  getTrack(options: GetTrackOptions): Promise<GetTrackResult>;

  /**
   * Delete the on-disk JSONL for a run.
   * Call after successfully uploading the run, or on explicit cancel.
   */
  clearTrack(options: { runId: string }): Promise<void>;
}
