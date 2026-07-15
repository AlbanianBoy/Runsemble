// POST /api/push-token
// Saves (or clears) the FCM device token for the authenticated user.
// Called once on app launch after the Capacitor PushNotifications plugin
// resolves the device token.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const token: string | null = body?.token ?? null

  await db.user.update({
    where: { id: session.userId },
    data: { fcmToken: token },
  })

  return NextResponse.json({ ok: true })
}
