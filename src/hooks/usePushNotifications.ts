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

    // ── 1. Attach listeners FIRST so we never miss the registration event ──
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

    // ── 2. Check / request permission ──
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions()
    }
    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission not granted:', permStatus.receive)
      return
    }

    // ── 3. Register — triggers the 'registration' listener above ──
    await PushNotifications.register()
  } catch {
    // Not running inside Capacitor (plain browser) — ignore.
  }
}
