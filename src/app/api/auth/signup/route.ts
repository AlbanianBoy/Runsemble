import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, validatePasswordStrength } from '@/lib/password'
import { createSession, toSafeUser } from '@/lib/auth'
import { createVerificationCode } from '@/lib/verification'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    if (!await rateLimit(`signup:${clientIp(request)}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts — wait a minute and try again' }, { status: 429 })
    }
    const body = await request.json()
    const {
      name,
      email,
      password,
      consent,
      bio,
      city,
      paceLevel,
      schedulePreference,
      lat,
      lng,
    } = body

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    // Password strength: length + common-pattern rejection.
    const passwordError = validatePasswordStrength(password ?? '')
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 })
    }

    if (!consent) {
      return NextResponse.json(
        { error: 'You need to accept the data processing terms to use Runsemble' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists — try logging in' },
        { status: 409 }
      )
    }

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: hashPassword(password),
        consentAt: new Date(),
        bio: bio ?? null,
        city: city ?? 'Antwerp',
        paceLevel: paceLevel ?? 'beginner',
        schedulePreference: typeof schedulePreference === 'string' ? schedulePreference : '',
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        onboardingComplete: true,
        isAvailable: false,
        privacyVisible: true,
      },
    })

    await createSession(user.id)

    try {
      const code = await createVerificationCode(user.id, 'email_verify')
      await sendVerificationEmail(user.email, code)
    } catch (err) {
      console.error('Error sending verification email:', err)
    }

    return NextResponse.json({ user: toSafeUser(user) }, { status: 201 })
  } catch (error) {
    console.error('Error signing up:', error)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
