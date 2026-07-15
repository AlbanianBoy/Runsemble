import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { createVerificationCode } from '@/lib/verification'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rate-limit'

// (Re)send an email-verification code to the logged-in user's address.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`send-verification:${clientIp(request)}`, 3, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts — wait a minute and try again' }, { status: 429 })
    }

    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    if (me.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true })
    }

    const code = await createVerificationCode(me.id, 'email_verify')
    const res = await sendVerificationEmail(me.email, code)
    if (!res.ok) {
      return NextResponse.json({ error: res.error ?? 'Could not send email' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error sending verification:', error)
    return NextResponse.json({ error: 'Could not send code' }, { status: 500 })
  }
}
