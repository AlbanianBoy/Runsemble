// ─── Position watching (web + native) ────────────────────────────────────────
// One place that watches the device's location. On the web it uses the browser
// Geolocation API (foreground only). Inside the Capacitor app it uses the native
// background-geolocation plugin, which runs a foreground service so a run keeps
// recording with the screen off — the whole reason for the native build.
//
// The plugin is bound by name via registerPlugin (the community package ships no
// runtime entry, only types), and its native methods are only ever *called* when
// running natively — on the web the proxy is created but never invoked.

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

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
    await (BackgroundGeolocation as unknown as { openSettings: () => Promise<void> }).openSettings()
  } catch {
    // web / unavailable — no-op
  }
}

// Native device manufacturer + model (from Build.*, reliable). Used to show the
// right OEM-specific "keep tracking alive" guidance. Empty on web / old builds.
export async function getDeviceInfo(): Promise<{ manufacturer: string; model: string }> {
  if (!isNativeApp()) return { manufacturer: '', model: '' }
  try {
    const res = await (
      BackgroundGeolocation as unknown as { getDeviceInfo: () => Promise<{ manufacturer?: string; model?: string }> }
    ).getDeviceInfo()
    return { manufacturer: (res.manufacturer ?? '').toLowerCase(), model: res.model ?? '' }
  } catch {
    return { manufacturer: '', model: '' }
  }
}

// Is the app on the OS battery-optimization whitelist? True on web (nothing to
// exempt) and defaults true on error so we never nag spuriously.
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!isNativeApp()) return true
  try {
    const res = await (
      BackgroundGeolocation as unknown as { isIgnoringBatteryOptimizations: () => Promise<{ ignoring?: boolean }> }
    ).isIgnoringBatteryOptimizations()
    return res.ignoring !== false
  } catch {
    return true
  }
}

// Pop the one-tap system dialog to exempt the app from Doze/battery optimization.
// The reliable, OEM-agnostic way to survive screen-off on Samsung/Xiaomi/etc.
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await (BackgroundGeolocation as unknown as { requestIgnoreBatteryOptimizations: () => Promise<void> }).requestIgnoreBatteryOptimizations()
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
      BackgroundGeolocation as unknown as { getFlightLog: () => Promise<{ log?: string }> }
    ).getFlightLog()
    return res.log ?? ''
  } catch {
    return ''
  }
}

export async function clearFlightLog(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await (BackgroundGeolocation as unknown as { clearFlightLog: () => Promise<void> }).clearFlightLog()
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
// The web JS can reach a phone still running an older native build (JS ships via
// the web, native ships via a rebuild), so we probe once and fall back to the
// live callback for distance when the buffer isn't there. Probing also clears any
// stale pre-run fixes, which is harmless at startup.
export async function nativeBufferSupported(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    await (BackgroundGeolocation as unknown as { getBufferedLocations: () => Promise<unknown> }).getBufferedLocations()
    return true
  } catch {
    return false
  }
}

// Pull every fix the native plugin collected while the WebView JS was frozen
// (screen off / backgrounded) and clear its buffer. No-op on the web, where the
// browser Geolocation API only runs in the foreground anyway. Each fix carries
// its true GPS time so the run's distance/route can be reconstructed on resume.
export async function drainBufferedLocations(): Promise<BufferedFix[]> {
  if (!isNativeApp()) return []
  try {
    const res = await (
      BackgroundGeolocation as unknown as {
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
    // Old native build without the buffer method, or web — nothing to drain.
    return []
  }
}

export interface PositionWatchHandlers {
  // accuracy is the reported horizontal accuracy in metres (null if unknown).
  // t is the GPS fix time in ms epoch — the *real* time of the reading, which
  // matters when the OS delivers a batch of buffered background points on resume
  // (they carry their true timestamps, so distance/route can be reconstructed).
  onPosition: (lat: number, lng: number, accuracy: number | null, t: number) => void
  onError: (kind: GpsError) => void
}

/** Start watching position; returns a function that stops the watch. */
export function startPositionWatch(handlers: PositionWatchHandlers): () => void {
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
  let watcherId: string | null = null
  let stopped = false

  BackgroundGeolocation.addWatcher(
    {
      // Shown in the persistent notification while tracking in the background —
      // required by Android for background location.
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
