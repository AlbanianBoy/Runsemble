// ─── Phone verification: send the code ────────────────────────────────────────
// A confirmed phone number is cheap Sybil friction and flips the top-level
// `verified` trust badge (see the verify route). This stores the number
// unverified, mints a 6-digit code (hashed, single-use, 15-min TTL — the same
// machinery as email verification), and texts it via Vonage.
//
// Provider: Vonage SMS REST API — plain fetch, no SDK. Inert until the keys are
// set: VONAGE_API_KEY, VONAGE_API_SECRET (+ optional VONAGE_SENDER_ID).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { createVerificationCode } from '@/lib/verification'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { apiError, readJson } from '@/lib/http'

export async function POST(request: NextRequest) {
  try {
    // Keyed on IP — the account exists but SMS costs money per send, so this is
    // the one place an authenticated action is still rate-limited by origin.
    if (!(await checkRateLimit(`phone-send:${clientIp(request)}`, 3, 60_000))) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const phone = typeof parsed.body.phone === 'string' ? parsed.body.phone.trim() : ''

    // Minimal E.164 sanity check — the authoritative validation is Vonage's.
    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
      return apiError(400, 'invalid_value', 'Enter a valid phone number, e.g. +32495123456')
    }

    // Persist the (still-unverified) number so the verify route can confirm it
    // belongs to this account.
    await db.user.update({
      where: { id: me.id },
      data: { phone, phoneVerified: false },
    })

    const code = await createVerificationCode(me.id, 'phone_verify')

    // If the provider isn't configured yet, fail honestly rather than pretending
    // an SMS went out.
    if (!process.env.VONAGE_API_KEY || !process.env.VONAGE_API_SECRET) {
      console.error('Vonage keys not set — cannot send phone verification SMS')
      return apiError(500, 'internal', 'SMS is not available right now — try again later')
    }

    const vonageRes = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.VONAGE_API_KEY,
        api_secret: process.env.VONAGE_API_SECRET,
        to: phone.replace('+', ''), // Vonage wants no leading +
        from: process.env.VONAGE_SENDER_ID ?? 'Runsemble',
        text: `Je Runsemble verificatiecode is: ${code}. Geldig voor 10 minuten.`,
      }),
    })

    if (!vonageRes.ok) {
      console.error('Vonage HTTP error', vonageRes.status)
      return apiError(502, 'internal', 'Could not send the SMS — try again later')
    }

    const data = (await vonageRes.json()) as { messages?: Array<{ status?: string; ['error-text']?: string }> }
    const msg = data?.messages?.[0]
    if (msg?.status !== '0') {
      console.error('Vonage message error', msg?.status, msg?.['error-text'])
      return apiError(502, 'internal', 'Could not send the SMS — check the number and try again')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error sending phone verification:', error)
    return apiError(500, 'internal', 'Could not send SMS code')
  }
}
