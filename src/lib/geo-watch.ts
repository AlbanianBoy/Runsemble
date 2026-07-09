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
      if (location) onPosition(location.latitude, location.longitude, location.accuracy ?? null)
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
