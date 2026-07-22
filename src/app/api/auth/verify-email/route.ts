import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'
import { consumeVerificationCode } from '@/lib/verification'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { apiError, readJson } from '@/lib/http'

// Confirm the logged-in user's email with the 6-digit code they were sent.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`verify-email:${clientIp(request)}`, 10, 60_000)) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    if (me.emailVerified) {
      return NextResponse.json({ ok: true, user: toSafeUser(me) })
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const code = typeof parsed.body.code === 'string' ? parsed.body.code : ''

    if (!code.trim()) {
      return apiError(400, 'missing_field', 'Code is required')
    }

    const check = await consumeVerificationCode(me.id, 'email_verify', code.trim())
    if (!check.ok) {
      return apiError(400, 'invalid_value', check.error ?? 'Invalid code')
    }

    const user = await db.user.update({
      where: { id: me.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    })

    return NextResponse.json({ ok: true, user: toSafeUser(user) })
  } catch (error) {
    console.error('Error verifying email:', error)
    return apiError(500, 'internal', 'Failed to verify email')
  }
}
