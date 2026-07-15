/**
 * run-telemetry.ts — Phase 3 GPS diagnostics.
 *
 * Collects a lightweight telemetry snapshot at run-save time so we can
 * diagnose OEM screen-off GPS gaps without needing adb or crash logs.
 * Every field is optional / nullable — this must NEVER block a save.
 */

import { Capacitor } from '@capacitor/core'
import { getFlightLog } from '@/lib/geo-watch'

export type GpsProvider = 'recorder' | 'buffer' | 'live' | 'demo'

export interface RunTelemetry {
  pointCount: number
  rejectedCount: number
  gpsProvider: GpsProvider
  screenOffRatio: number | null   // fraction of elapsed time with screen off; null if unavailable
  deviceModel: string | null      // e.g. "Samsung Galaxy S24"; null on web
  isNative: boolean
  setupComplete: boolean          // did GPS initialise before the run started?
  elapsedSec: number
}

export interface CollectOptions {
  pointCount: number
  rejectedCount: number
  gpsProvider: GpsProvider
  elapsedSec: number
  setupComplete: boolean
}

/** Parse screen-off ratio from the native flight log (screen_off/screen_on events). */
function parseScreenOffRatio(log: string, elapsedSec: number): number | null {
  if (!log || elapsedSec <= 0) return null
  const events: Array<{ type: 'screen_off' | 'screen_on'; t: number }> = []
  for (const line of log.trim().split('\n')) {
    try {
      const obj = JSON.parse(line)
      if (obj.type === 'screen_off' || obj.type === 'screen_on') {
        events.push({ type: obj.type, t: Number(obj.t) })
      }
    } catch { /* skip malformed lines */ }
  }
  if (events.length === 0) return null
  events.sort((a, b) => a.t - b.t)
  let offMs = 0
  let offSince: number | null = null
  for (const e of events) {
    if (e.type === 'screen_off' && offSince == null) { offSince = e.t }
    else if (e.type === 'screen_on' && offSince != null) { offMs += e.t - offSince; offSince = null }
  }
  if (offSince != null) offMs += Date.now() - offSince
  return Math.min(1, offMs / (elapsedSec * 1000))
}

/** Collect a telemetry snapshot. Always resolves — caller may receive null on error. */
export async function collectTelemetry(opts: CollectOptions): Promise<RunTelemetry | null> {
  try {
    const isNative = (() => {
      try { return typeof window !== 'undefined' && Capacitor.isNativePlatform() } catch { return false }
    })()

    let deviceModel: string | null = null
    if (isNative) {
      try {
        const { Device } = await import('@capacitor/device')
        const info = await Device.getInfo()
        deviceModel = info.model ?? null
      } catch { /* plugin absent or failed */ }
    }

    let screenOffRatio: number | null = null
    if (isNative) {
      try {
        const log = await getFlightLog()
        if (log) screenOffRatio = parseScreenOffRatio(log, opts.elapsedSec)
      } catch { /* no flight log */ }
    }

    return {
      pointCount: opts.pointCount,
      rejectedCount: opts.rejectedCount,
      gpsProvider: opts.gpsProvider,
      screenOffRatio,
      deviceModel,
      isNative,
      setupComplete: opts.setupComplete,
      elapsedSec: opts.elapsedSec,
    }
  } catch {
    return null
  }
}
