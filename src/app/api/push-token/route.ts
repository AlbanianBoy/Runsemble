// POST /api/push-token
// Registers the calling device for push. Called on every app launch once the
// Capacitor PushNotifications plugin resolves a token, and again whenever FCM
// rotates one.
//
// Upserts a UserDevice row keyed on the token, rather than writing a column on
// User. FCM issues a token per app install, so one person legitimately has
// several at once — phone, tablet, a reinstall. The previous single-column
// design meant the second device to register overwrote the first, and the first
// then received nothing for ever: no error, nothing in any log, just silence.

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

const PLATFORMS = new Set(['android', 'ios', 'web', 'unknown'])

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const token: unknown = body?.token
  const platform: string =
    typeof body?.platform === 'string' && PLATFORMS.has(body.platform) ? body.platform : 'unknown'

  // An empty token means the device has nothing to register (permission refused,
  // or signing out). Nothing to store, and not an error.
  if (token === null || token === undefined || token === '') {
    return NextResponse.json({ ok: true })
  }
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Keyed on the token: re-registering the same device refreshes it, and a
  // device that changed hands is reassigned to whoever is signed in now rather
  // than left delivering this user's messages to someone else's lock screen.
  await db.userDevice.upsert({
    where: { token },
    create: { userId: user.id, token, platform },
    update: { userId: user.id, platform, enabled: true, lastSeenAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

// DELETE /api/push-token — unregister a single device, e.g. on sign-out here.
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const token: unknown = body?.token
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Scoped to the caller, so one account can't unregister another's device.
  await db.userDevice.deleteMany({ where: { token, userId: user.id } })
  return NextResponse.json({ ok: true })
}
