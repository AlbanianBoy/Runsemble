// ─── usePushNotifications ───────────────────────────────────────────────────────
// Registers the device for FCM and uploads the token. Returns early on web —
// the plugin only exists on native, and touching it in a browser throws.
//
// Also the app's real-time layer, which it already had and wasn't using. A push
// reaches the device in about a second; nothing listened for one arriving while
// the app was open, so a delivered DM still sat there until the next 5s poll.
// Now an arriving push invalidates whatever it made stale, and the existing poll
// becomes the fallback for when a push is missed or permission was refused.
//
// This is why there's no SSE or WebSocket here: on serverless every open stream
// holds a function invocation for its whole life, and with no pub/sub behind it
// the handler would poll the database anyway — polling with extra steps, and a
// bill. The push channel already exists, is already paid for, and already knows
// when something happened.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useQueryClient } from '@tanstack/react-query'
import { useRunsembleStore } from '@/lib/store'
import { tabForPush, isDmPush, queryKeysForPush, type PushTab } from '@/lib/push-routing'

function isNative(): boolean {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

export function usePushNotifications() {
  const { openDm, setActiveTab } = useRunsembleStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    const invalidate = (type: string | undefined) => {
      for (const key of queryKeysForPush(type)) {
        // Prefix match: keys are ['conversations', userId] and the like.
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    }
    registerPush({ openDm, setActiveTab, invalidate })
  }, [openDm, setActiveTab, queryClient])
}

async function registerPush({
  openDm,
  setActiveTab,
  invalidate,
}: {
  openDm: (partner: { id: string; name: string }) => void
  setActiveTab: (tab: PushTab) => void
  invalidate: (type: string | undefined) => void
}) {
  // The platform check IS the web guard, not the import. On web the dynamic
  // import below succeeds — the package is bundled — and then every addListener
  // call touches a plugin with no web implementation and rejects. Because those
  // calls aren't awaited, the rejections escape as unhandled promise rejections
  // (Sentry caught exactly this on the first production load: "'PushNotifications'
  // plugin is not implemented on web"). A plain browser has nothing to register.
  if (!isNative()) return

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // ── 1. Token registration ─────────────────────────────────────────────────
    PushNotifications.addListener('registration', async ({ value: token }) => {
      console.log('FCM token received:', token)
      try {
        const res = await fetch('/api/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (!res.ok) console.error('push token upload failed, status:', res.status)
        else console.log('FCM token saved successfully')
      } catch (e) {
        console.error('push token upload failed:', e)
      }
    })

    PushNotifications.addListener('registrationError', (err) => {
      console.error('FCM registration error:', err)
    })

    // ── 2. Arriving while the app is open ─────────────────────────────────────
    // The push is the event; treat it as one. Without this the data it describes
    // sits stale until a poll happens to notice.
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = (notification.data ?? {}) as { type?: string }
      invalidate(data.type)
    })

    // ── 3. Notification tap handler (deep linking) ────────────────────────────
    // Fired when the user taps a notification while the app is backgrounded
    // OR cold-started via a notification.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action.notification.data ?? {}) as {
        type?: string
        senderId?: string
        senderName?: string
      }

      // Land where the thing actually is. This used to be Groups for everything,
      // so a badge or a like took you to your conversations.
      setActiveTab(tabForPush(data.type))
      invalidate(data.type)

      if (isDmPush(data)) {
        // Small delay so the Groups tab and Zustand store are fully mounted
        // before we try to open the DM sheet (matters on cold-start).
        setTimeout(() => {
          openDm({ id: data.senderId!, name: data.senderName! })
        }, 300)
      }
    })

    // ── 3. Permissions ────────────────────────────────────────────────────────
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions()
    }
    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission not granted:', permStatus.receive)
      return
    }

    // ── 4. Register ───────────────────────────────────────────────────────────
    await PushNotifications.register()
  } catch {
    // Not running inside Capacitor (plain browser) — ignore.
  }
}
