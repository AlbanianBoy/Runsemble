'use client'

// ─── useLocationRefresh ───────────────────────────────────────────────────────
// Re-reads the signed-in user's position when the app opens and saves it.
//
// Without this, lat/lng were written once during onboarding and never again, so
// everyone's pin stayed wherever they happened to sign up — someone who joined in
// the park showed as "in the park" from their sofa, forever. For an app whose
// premise is "who's around right now", the map was answering a different question.
//
// Two rules, both deliberate:
//
//   Never prompt. The permission dialog belongs to onboarding, where the user
//   asked for this. Popping it on every launch is how apps get their location
//   permission revoked. We only refresh when permission is already granted and
//   the user has coordinates stored from before — i.e. they said yes once and
//   haven't changed their mind.
//
//   Never block. Failure is silent: a stale pin is better than a broken launch,
//   and the map falls back to the city centre regardless.
//
// On app open rather than continuously: enough for "who's around now", no
// background permission, no battery cost. Live tracking already exists in the
// run tracker, where the user explicitly started a run.

import { useEffect } from 'react'
import { apiSend } from '@/lib/api'

/** Treat a cached fix up to 5 minutes old as current — no need to wake the GPS. */
const MAX_AGE_MS = 5 * 60_000
const TIMEOUT_MS = 10_000

async function permissionAlreadyGranted(): Promise<boolean> {
  try {
    // Safari doesn't support querying geolocation, and throws. Falling through
    // is safe: the caller only gets here when coordinates are already stored,
    // which means permission was granted at some point.
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    return status ? status.state === 'granted' : true
  } catch {
    return true
  }
}

/**
 * @param userId       signed-in user, or undefined while the store hydrates
 * @param hasCoords    whether this user already has a stored position — our proxy
 *                     for "they granted location once", so we never prompt
 * @param onUpdate     lets the caller keep the local store in step, so the map
 *                     recentres without waiting for a refetch
 */
export function useLocationRefresh(
  userId: string | undefined,
  hasCoords: boolean,
  onUpdate?: (coords: { lat: number; lng: number }) => void
) {
  useEffect(() => {
    if (!userId || !hasCoords) return
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return

    let cancelled = false

    void (async () => {
      if (!(await permissionAlreadyGranted()) || cancelled) return

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          if (cancelled) return
          const next = { lat: coords.latitude, lng: coords.longitude }
          try {
            await apiSend(`/api/users/${userId}`, 'PATCH', next)
            if (!cancelled) onUpdate?.(next)
          } catch {
            // Offline or the request failed — the old position stays. Not worth
            // telling the user about something they didn't ask for.
          }
        },
        () => {
          // Denied or timed out. Silent by design.
        },
        { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS, enableHighAccuracy: false }
      )
    })()

    return () => {
      cancelled = true
    }
  }, [userId, hasCoords, onUpdate])
}
