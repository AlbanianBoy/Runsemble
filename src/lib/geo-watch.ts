// ─── Position watching (web + native) ─────────────────────────────────────────────────
// One place that watches the device's location. On the web it uses the browser
// Geolocation API (foreground only). Inside the Capacitor app it uses the native
// background-geolocation plugin, which runs a foreground service so a run keeps
// recording with the screen off — the whole reason for the native build.
//
// Battery-optimisation helpers (isIgnoringBatteryOptimizations,
// requestIgnoreBatteryOptimizations) are routed through the RunRecorder plugin
// because it actually exposes those @PluginMethods. The previous implementation
// cast BackgroundGeolocation to an unknown type and called them there — that
// plugin doesn't expose those methods, so the calls silently threw and the
// 'Allow background' button in the permission nudge was a no-op.

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'

// ─── Lazy singletons ──────────────────────────────────────────────────────────
// registerPlugin must NOT be called at module-load time: Next.js evaluates
// this module on the server (SSR) AND in the browser bundle, which causes
// Capacitor to throw "plugin already registered". We defer the call to the
// first actual use, guarded by a typeof-window check so it never runs SSR.

let _bgGeo: BackgroundGeolocationPlugin | null = null
function getBackgroundGeolocation(): BackgroundGeolocationPlugin {
  if (!_bgGeo) {
    if (typeof window === 'undefined') {
      // SSR — return a no-op stub so imports don't crash on the server
      _bgGeo = {
        addWatcher: async () => '',
        removeWatcher: async () => {},
        openSettings: async () => {},
        getBufferedLocations: async () => ({ locations: [] }),
        getFlightLog: async () => ({ log: '' }),
        clearFlightLog: async () => {},
        getDeviceInfo: async () => ({ manufacturer: '', model: '' }),
      } as unknown as BackgroundGeolocationPlugin
    } else {
      _bgGeo = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')
    }
  }
  return _bgGeo
}

// Minimal interface for the RunRecorder plugin methods we call here.
// The full surface lives in src/lib/run-recorder.ts.
interface RunRecorderBatteryPlugin {
  isIgnoringBatteryOptimizations(): Promise<{ ignoring?: boolean }>
  requestIgnoreBatteryOptimizations(): Promise<void>
  getDeviceInfo?(): Promise<{ manufacturer?: string; model?: string }>
}

let _runRecorderBattery: RunRecorderBatteryPlugin | null = null
function getRunRecorderBattery(): RunRecorderBatteryPlugin {
  if (!_runRecorderBattery) {
    if (typeof window === 'undefined') {
      _runRecorderBattery = {
        isIgnoringBatteryOptimizations: async () => ({ ignoring: true }),
        requestIgnoreBatteryOptimizations: async () => {},
        getDeviceInfo: async () => ({ manufacturer: '', model: '' }),
      }
    } else {
      _runRecorderBattery = registerPlugin<RunRecorderBatteryPlugin>('RunRecorder')
    }
  }
  return _runRecorderBattery
}

export type GpsError = 'denied' | 'unavailable'

/** True inside the Capacitor app (real background GPS), false on the plain web. */
export function isNativeApp(): boolean {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

// Open this app's system settings page, where the user grants "Allow all the
// time" location and notifications — the two things Android won't let us request
// from an in-app prompt but that background run tracking needs.
export async function openAppSettings(): Promise<void> {
  try {
    await (getBackgroundGeolocation() as unknown as { openSettings: () => Promise<void> }).openSettings()
  } catch {
    // web / unavailable — no-op
  }
}

// Native device manufacturer + model (from Build.*, reliable). Used to show the
// right OEM-specific "keep tracking alive" guidance. Empty on web / old builds.
export async function getDeviceInfo(): Promise<{ manufacturer: string; model: string }> {
  if (!isNativeApp()) return { manufacturer: '', model: '' }
  try {
    // Try RunRecorder first (newer builds); fall back to BackgroundGeolocation cast.
    const rr = getRunRecorderBattery()
    if (rr.getDeviceInfo) {
      const res = await rr.getDeviceInfo()
      if (res.manufacturer) return { manufacturer: (res.manufacturer ?? '').toLowerCase(), model: res.model ?? '' }
    }
    const res = await (
      getBackgroundGeolocation() as unknown as { getDeviceInfo: () => Promise<{ manufacturer?: string; model?: string }> }
    ).getDeviceInfo()
    return { manufacturer: (res.manufacturer ?? '').toLowerCase(), model: res.model ?? '' }
  } catch {
    return { manufacturer: '', model: '' }
  }
}

// Is the app on the OS battery-optimization whitelist?
// Routed through RunRecorder which actually implements the @PluginMethod.
// Returns true on web (nothing to exempt) and defaults true on error so we
// never nag spuriously.
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!isNativeApp()) return true
  try {
    const res = await getRunRecorderBattery().isIgnoringBatteryOptimizations()
    return res.ignoring !== false
  } catch {
    return true
  }
}

// Pop the one-tap system dialog to exempt the app from Doze/battery optimization.
// Routed through RunRecorder which actually implements the @PluginMethod —
// previously this was cast onto BackgroundGeolocation which silently threw.
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await getRunRecorderBattery().requestIgnoreBatteryOptimizations()
  } catch {
    // web / unavailable — no-op
  }
}

// Pull the native "flight recorder" log (every fix / lost / watchdog event the
// service saw) so a screen-off walk can be diagnosed after the fact — no adb.
// Returns '' on web or an un-patched native build.
export async function getFlightLog(): Promise<string> {
  if (!isNativeApp()) return ''
  try {
    const res = await (
      getBackgroundGeolocation() as unknown as { getFlightLog: () => Promise<{ log?: string }> }
    ).getFlightLog()
    return res.log ?? ''
  } catch {
    return ''
  }
}

export async function clearFlightLog(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await (getBackgroundGeolocation() as unknown as { clearFlightLog: () => Promise<void> }).clearFlightLog()
  } catch {
    // web / unavailable — no-op
  }
}

// A GPS fix pulled from the native buffer (see drainBufferedLocations).
export interface BufferedFix {
  lat: number
  lng: number
  accuracy: number | null
  t: number
}

// Whether the installed native app has the buffering patch (getBufferedLocations).
export async function nativeBufferSupported(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    await (getBackgroundGeolocation() as unknown as { getBufferedLocations: () => Promise<unknown> }).getBufferedLocations()
    return true
  } catch {
    return false
  }
}

// Pull every fix the native plugin collected while the WebView JS was frozen
// (screen off / backgrounded) and clear its buffer.
export async function drainBufferedLocations(): Promise<BufferedFix[]> {
  if (!isNativeApp()) return []
  try {
    const res = await (
      getBackgroundGeolocation() as unknown as {
        getBufferedLocations: () => Promise<{
          locations?: Array<{ latitude: number; longitude: number; accuracy: number | null; time: number }>
        }>
      }
    ).getBufferedLocations()
    return (res.locations ?? []).map((l) => ({
      lat: l.latitude,
      lng: l.longitude,
      accuracy: l.accuracy ?? null,
      t: l.time ?? Date.now(),
    }))
  } catch {
    return []
  }
}

export interface PositionWatchHandlers {
  onPosition: (lat: number, lng: number, accuracy: number | null, t: number) => void
  onError: (kind: GpsError) => void
}

/** Start watching position; returns a function that stops the watch. */
export function startPositionWatch(handlers: PositionWatchHandlers): () => void {
  if (typeof window === 'undefined') return () => {}
  return Capacitor.isNativePlatform() ? startNativeWatch(handlers) : startWebWatch(handlers)
}

function startWebWatch({ onPosition, onError }: PositionWatchHandlers): () => void {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    onError('unavailable')
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (loc) => onPosition(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy ?? null, loc.timestamp),
    (err) => onError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  )
  return () => navigator.geolocation.clearWatch(id)
}

function startNativeWatch({ onPosition, onError }: PositionWatchHandlers): () => void {
  const BackgroundGeolocation = getBackgroundGeolocation()
  let watcherId: string | null = null
  let stopped = false

  BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Runsemble is tracking your run',
      backgroundMessage: 'Tap to return to the app.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 5,
    },
    (location, error) => {
      if (error) {
        onError(error.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable')
        return
      }
      if (location) onPosition(location.latitude, location.longitude, location.accuracy ?? null, location.time ?? Date.now())
    }
  )
    .then((id) => {
      if (stopped) {
        void BackgroundGeolocation.removeWatcher({ id })
        return
      }
      watcherId = id
    })
    .catch(() => onError('unavailable'))

  return () => {
    stopped = true
    if (watcherId) {
      const id = watcherId
      void BackgroundGeolocation.removeWatcher({ id })
    }
  }
}
