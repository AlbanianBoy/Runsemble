// ─── Position watching (web + native) ────────────────────────────────────────
// One place that watches the device's location. On the web it uses the browser
// Geolocation API (foreground only). Inside the Capacitor app it uses
// @capgo/background-geolocation (built for Capacitor 8), which keeps a run
// recording with the screen off — the whole reason for the native build. Its
// native methods are only ever *called* when running natively.

import { Capacitor } from '@capacitor/core'
import { BackgroundGeolocation } from '@capgo/background-geolocation'

export type GpsError = 'denied' | 'unavailable'

/** True inside the Capacitor app (real background GPS), false on the plain web. */
export function isNativeApp(): boolean {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

// Open this app's system settings page, where the user grants "Allow all the
// time" location and notifications — the two things the OS won't let us request
// from an in-app prompt but that background run tracking needs.
export async function openAppSettings(): Promise<void> {
  try {
    await BackgroundGeolocation.openSettings()
  } catch {
    // web / unavailable — no-op
  }
}

export interface PositionWatchHandlers {
  // accuracy is the reported horizontal accuracy in metres (null if unknown).
  // The caller uses it to reject drifty readings so standing still doesn't
  // accumulate fake distance.
  onPosition: (lat: number, lng: number, accuracy: number | null) => void
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
    (loc) => onPosition(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy ?? null),
    (err) => onError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  )
  return () => navigator.geolocation.clearWatch(id)
}

function startNativeWatch({ onPosition, onError }: PositionWatchHandlers): () => void {
  // One background watcher: start() begins it, stop() ends it. The persistent
  // notification (backgroundTitle/Message) is what the OS requires to keep
  // recording location in the background.
  BackgroundGeolocation.start(
    {
      backgroundTitle: 'Runsemble is tracking your run',
      backgroundMessage: 'Tap to return to the app.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 5,
    },
    (position, error) => {
      if (error) {
        onError(error.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable')
        return
      }
      if (position) onPosition(position.latitude, position.longitude, position.accuracy ?? null)
    }
  ).catch(() => onError('unavailable'))

  return () => {
    void BackgroundGeolocation.stop()
  }
}
