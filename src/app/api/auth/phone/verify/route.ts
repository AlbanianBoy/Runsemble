import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'
import { consumeVerificationCode } from '@/lib/verification'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { apiError, readJson } from '@/lib/http'

// Confirm the logged-in user's phone number with the 6-digit code they received via SMS.
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`verify-phone:${clientIp(request)}`, 10, 60_000))) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    if (me.phoneVerified) {
      return NextResponse.json({ ok: true, user: toSafeUser(me) })
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const code = typeof parsed.body.code === 'string' ? parsed.body.code : ''

    if (!code.trim()) {
      return apiError(400, 'missing_field', 'Code is required')
    }

    const check = await consumeVerificationCode(me.id, 'phone_verify', code.trim())
    if (!check.ok) {
      return apiError(400, 'invalid_value', check.error ?? 'Ongeldige code')
    }

    // Mark phone as verified and flip the top-level `verified` badge
    // so the user gets a checkmark on their profile and on map pins.
    const user = await db.user.update({
      where: { id: me.id },
      data: {
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        verified: true, // unlocks the trust badge across the app
      },
    })

    return NextResponse.json({ ok: true, user: toSafeUser(user) })
  } catch (error) {
    console.error('Error verifying phone:', error)
    return apiError(500, 'internal', 'Failed to verify phone number')
  }
}
