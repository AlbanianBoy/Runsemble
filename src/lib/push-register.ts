// ─── usePushRegistration ────────────────────────────────────────────────────
// Runs once when the app opens (or the user logs in). On native it:
//   1. Requests notification permission (no-op if already granted).
//   2. Reads the FCM registration token from the Capacitor push plugin.
//   3. PATCHes it to the server so /api/messages can send targeted pushes.
//
// On web (or if PushNotifications is unavailable) it's a silent no-op — the
// server-side sendPush() already guards against a missing token.
//
// Token refresh: FCM can rotate a token while the app is installed. We listen
// for the `registration` event (fires on every token refresh) and re-PATCH so
// the stored token is always current.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { apiSend } from '@/lib/api'

function isNative(): boolean {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

export function usePushRegistration(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId || !isNative()) return

    let cancelled = false

    async function register() {
      // Dynamic import keeps the plugin out of the web bundle entirely — it only
      // resolves on native builds that have @capacitor/push-notifications wired.
      let PushNotifications: typeof import('@capacitor/push-notifications').PushNotifications
      try {
        const mod = await import('@capacitor/push-notifications')
        PushNotifications = mod.PushNotifications
      } catch {
        return // package not installed in this build
      }

      if (cancelled) return

      // Ask for permission the first time; subsequent calls are instant no-ops.
      const { receive } = await PushNotifications.requestPermissions()
      if (cancelled || receive !== 'granted') return

      // One-shot: read the current token (triggers `registration` event).
      await PushNotifications.register()

      // Listen for the token — fires now (registration) and on future rotations.
      const handler = await PushNotifications.addListener('registration', async (token) => {
        if (cancelled || !userId) return
        try {
          // /api/push-token upserts a UserDevice row. This used to PATCH an
          // fcmToken column on the user, which meant a second device overwrote
          // the first and the first silently stopped receiving anything.
          await apiSend('/api/push-token', 'POST', {
            token: token.value,
            platform: Capacitor.getPlatform(),
          })
        } catch {
          // Best-effort — a registration failure must never surface to the user.
        }
      })

      // Clean up on unmount (userId change / logout)
      return () => { handler.remove() }
    }

    let cleanup: (() => void) | undefined
    void register().then((fn) => { cleanup = fn })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [userId])
}
