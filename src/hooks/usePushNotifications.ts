// ─── usePushNotifications ───────────────────────────────────────────────────────
// Registers the device for FCM push notifications and uploads the token to the
// server. Safe to call on every app mount — it's a no-op on web.
// Tapping a notification deep-links into the app:
//   - data.type === 'message' + data.senderId/senderName → opens DM sheet
//   - any other notification → switches to Messages tab

import { useEffect } from 'react'
import { useRunsembleStore } from '@/lib/store'

export function usePushNotifications() {
  const { openDm, setActiveTab } = useRunsembleStore()

  useEffect(() => {
    registerPush({ openDm, setActiveTab })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

async function registerPush({
  openDm,
  setActiveTab,
}: {
  openDm: (partner: { id: string; name: string }) => void
  setActiveTab: (tab: 'feed' | 'map' | 'hotspots' | 'groups' | 'messages' | 'profile') => void
}) {
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

    // ── 2. Notification tap handler (deep linking) ─────────────────────────
    // Fired when the user taps a notification while the app is backgrounded.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as {
        type?: string
        senderId?: string
        senderName?: string
      }
      if (data?.type === 'message' && data.senderId && data.senderName) {
        // Open the DM sheet directly with the sender
        openDm({ id: data.senderId, name: data.senderName })
      } else {
        // Fallback: go to the Messages tab
        setActiveTab('messages')
      }
    })

    // ── 3. Permissions ────────────────────────────────────────────────────
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions()
    }
    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission not granted:', permStatus.receive)
      return
    }

    // ── 4. Register ──────────────────────────────────────────────────────
    await PushNotifications.register()
  } catch {
    // Not running inside Capacitor (plain browser) — ignore.
  }
}
