// ─── usePushNotifications ──────────────────────────────────────────────────────
// Registers the device for FCM push notifications and uploads the token to the
// server. Safe to call on every app mount — it's a no-op on web (Capacitor
// native plugin is not available in a browser).

import { useEffect } from 'react'

export function usePushNotifications() {
  useEffect(() => {
    registerPush()
  }, [])
}

async function registerPush() {
  try {
    // Dynamic import so Next.js doesn't bundle this for the web build.
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // Check / request permission.
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions()
    }
    if (permStatus.receive !== 'granted') return

    await PushNotifications.register()

    // Listen for the token — fires once after register().
    PushNotifications.addListener('registration', async ({ value: token }) => {
      try {
        await fetch('/api/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      } catch (e) {
        console.error('push token upload failed:', e)
      }
    })

    PushNotifications.addListener('registrationError', (err) => {
      console.error('FCM registration error:', err)
    })
  } catch {
    // Not running inside Capacitor (plain browser) — ignore.
  }
}
