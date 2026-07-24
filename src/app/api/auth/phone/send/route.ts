import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { createVerificationCode } from '@/lib/verification'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { apiError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

// Send a 6-digit SMS verification code to the user's phone number.
// The phone number is taken from the request body and stored on the user
// record (unverified) so the verify route can confirm it belongs to them.
//
// Provider: Vonage SMS API (https://developer.vonage.com)
// Free sandbox: 10,000 SMS/month — no credit card needed.
// Required env vars: VONAGE_API_KEY, VONAGE_API_SECRET
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`phone-send:${clientIp(request)}`, 3, 60_000))) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const body = await request.json().catch(() => ({}))
    const phone: string = (body.phone ?? '').trim()

    // Minimal E.164 sanity check — the real validation happens at Vonage.
    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
      return apiError(400, 'invalid_phone', 'Provide a valid phone number in E.164 format, e.g. +32495123456')
    }

    // Persist the (unverified) phone so the verify route can read it.
    await prisma.user.update({
      where: { id: me.id },
      data: { phone, phoneVerified: false },
    })

    // Create a 6-digit code stored as a hashed VerificationToken (type: phone_verify).
    const code = await createVerificationCode(me.id, 'phone_verify')

    // Send via Vonage SMS REST API — no SDK needed, just a POST.
    const vonageRes = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.VONAGE_API_KEY,
        api_secret: process.env.VONAGE_API_SECRET,
        to: phone.replace('+', ''), // Vonage expects no leading +
        from: process.env.VONAGE_SENDER_ID ?? 'Runsemble',
        text: `Je Runsemble verificatiecode is: ${code}. Geldig voor 10 minuten.`,
      }),
    })

    if (!vonageRes.ok) {
      console.error('Vonage HTTP error', vonageRes.status)
      return apiError(502, 'sms_failed', 'Could not send SMS — try again later')
    }

    const vonageData = await vonageRes.json()
    const msgStatus = vonageData?.messages?.[0]?.status
    if (msgStatus !== '0') {
      console.error('Vonage message error', vonageData)
      return apiError(502, 'sms_failed', `SMS delivery failed (code ${msgStatus})`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error sending phone verification:', error)
    return apiError(500, 'internal', 'Could not send SMS code')
  }
}
