import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'
import { consumeVerificationCode } from '@/lib/verification'
import { rateLimit, clientIp } from '@/lib/rate-limit'

// Confirm the logged-in user's email with the 6-digit code they were sent.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`verify-email:${clientIp(request)}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts — wait a minute and try again' }, { status: 429 })
    }

    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    if (me.emailVerified) {
      return NextResponse.json({ ok: true, user: toSafeUser(me) })
    }

    const { code } = await request.json()
    if (!code?.trim()) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 })
    }

    const check = await consumeVerificationCode(me.id, 'email_verify', code.trim())
    if (!check.ok) {
      return NextResponse.json({ error: check.error ?? 'Invalid code' }, { status: 400 })
    }

    const user = await db.user.update({
      where: { id: me.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    })

    return NextResponse.json({ ok: true, user: toSafeUser(user) })
  } catch (error) {
    console.error('Error verifying email:', error)
    return NextResponse.json({ error: 'Failed to verify email' }, { status: 500 })
  }
}
