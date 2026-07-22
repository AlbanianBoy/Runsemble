import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { createVerificationCode } from '@/lib/verification'
import { sendVerificationEmail } from '@/lib/email'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { apiError } from '@/lib/http'

// (Re)send an email-verification code to the logged-in user's address.
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`send-verification:${clientIp(request)}`, 3, 60_000))) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    if (me.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true })
    }

    const code = await createVerificationCode(me.id, 'email_verify')
    const res = await sendVerificationEmail(me.email, code)
    if (!res.ok) {
      return apiError(502, 'internal', res.error ?? 'Could not send email')
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error sending verification:', error)
    return apiError(500, 'internal', 'Could not send code')
  }
}
