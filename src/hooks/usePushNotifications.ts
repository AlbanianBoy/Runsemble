// ─── usePushNotifications ───────────────────────────────────────────────────────
// The one place the app talks to the push plugin: it registers the device for
// FCM, uploads the token, and turns an arriving push into a cache invalidation.
//
// "The one place" is the point. There used to be two — this hook, mounted from
// the root layout, and usePushRegistration, mounted from Providers — and both
// fully registered on every native launch. That cost three real things:
//   1. The layout copy ran with no signed-in user, so a fresh install asked for
//      notification permission before the account existed and then POSTed the
//      token to a route that 401s. The install got no push until FCM happened to
//      rotate the token, which it may never do.
//   2. Both added a `registration` listener, so one token produced two uploads.
//      Only one sent `platform`, so the row's platform came down to which POST
//      landed last — recorded as 'unknown' about half the time.
//   3. The layout copy never removed its listeners.
// Merged here, keyed on userId, with cleanup.
//
// This is also the app's real-time layer. A push reaches the device in about a
// second; nothing listened for one arriving while the app was open, so a
// delivered DM sat there until the next 5s poll. Now an arriving push
// invalidates whatever it made stale, and the poll is the fallback for when a
// push is missed or permission was refused.
//
// This is why there's no SSE or WebSocket: on serverless every open stream holds
// a function invocation for its whole life, and with no pub/sub behind it the
// handler would poll the database anyway — polling with extra steps, and a bill.
// The push channel already exists, is already paid for, and already knows when
// something happened.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { useQueryClient } from '@tanstack/react-query'
import { useRunsembleStore } from '@/lib/store'
import { apiSend } from '@/lib/api'
import { tabForPush, isDmPush, queryKeysForPush } from '@/lib/push-routing'

function isNative(): boolean {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

export function usePushNotifications(userId: string | null | undefined) {
  const openDm = useRunsembleStore((s) => s.openDm)
  const setActiveTab = useRunsembleStore((s) => s.setActiveTab)
  const queryClient = useQueryClient()

  useEffect(() => {
    // No account yet means nothing to register against: the token upload needs a
    // session, and asking for notification permission before someone has signed
    // up spends the single prompt iOS gives you on a stranger.
    if (!userId || !isNative()) return

    let cancelled = false
    let handles: PluginListenerHandle[] = []

    const invalidate = (type: string | undefined) => {
      for (const key of queryKeysForPush(type)) {
        // Prefix match: keys are ['conversations', userId] and the like.
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    }

    async function register() {
      // The platform check above IS the web guard, not this import. On web the
      // dynamic import succeeds — the package is bundled — and then every
      // addListener call touches a plugin with no web implementation and
      // rejects. Sentry caught exactly this on the first production load:
      // "'PushNotifications' plugin is not implemented on web".
      let PushNotifications: typeof import('@capacitor/push-notifications').PushNotifications
      try {
        const mod = await import('@capacitor/push-notifications')
        PushNotifications = mod.PushNotifications
      } catch {
        return // package not installed in this build
      }
      if (cancelled) return

      // Ask first, register second: registering without permission yields a
      // registrationError rather than a token.
      let perm = await PushNotifications.checkPermissions()
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions()
      }
      if (cancelled || perm.receive !== 'granted') return

      const added = await Promise.all([
        // Fires now (from register() below) and again on every future rotation.
        PushNotifications.addListener('registration', async ({ value: token }) => {
          if (cancelled) return
          try {
            // /api/push-token upserts a UserDevice row keyed on the token, so
            // one person can hold several at once — phone, tablet, a reinstall.
            await apiSend('/api/push-token', 'POST', {
              token,
              platform: Capacitor.getPlatform(),
            })
          } catch {
            // Best-effort — a registration failure must never reach the user.
          }
        }),

        PushNotifications.addListener('registrationError', (err) => {
          console.error('FCM registration error:', err)
        }),

        // Arriving while the app is open. The push is the event; treat it as
        // one, or the data it describes sits stale until a poll notices.
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          if (cancelled) return
          const data = (notification.data ?? {}) as { type?: string }
          invalidate(data.type)
        }),

        // Tapped while backgrounded, or cold-started from the notification.
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          if (cancelled) return
          const data = (action.notification.data ?? {}) as {
            type?: string
            senderId?: string
            senderName?: string
          }

          // Land where the thing actually is. This used to be Groups for
          // everything, so a badge or a like took you to your conversations.
          setActiveTab(tabForPush(data.type))
          invalidate(data.type)

          if (isDmPush(data)) {
            // Small delay so the tab and the store are mounted before the DM
            // sheet opens — matters on cold start.
            setTimeout(() => {
              openDm({ id: data.senderId!, name: data.senderName! })
            }, 300)
          }
        }),
      ])

      // Logout (or unmount) can land while those four awaits are in flight —
      // the cleanup below would then run against an empty array and leak them.
      if (cancelled) {
        await Promise.all(added.map((h) => h.remove()))
        return
      }
      handles = added

      await PushNotifications.register()
    }

    void register()

    return () => {
      cancelled = true
      for (const h of handles) void h.remove()
      handles = []
    }
  }, [userId, openDm, setActiveTab, queryClient])
}
