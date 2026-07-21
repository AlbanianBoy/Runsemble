import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, validatePassword } from '@/lib/password'
import { CURRENT_POLICY_VERSION, MIN_AGE, isOldEnough } from '@/lib/consent'
import { GENDERS } from '@/lib/enums'
import { createSession, toSafeUser } from '@/lib/auth'
import { createVerificationCode } from '@/lib/verification'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rate-limit'

// Create an account with a real password and start a session.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`signup:${clientIp(request)}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts — wait a minute and try again' }, { status: 429 })
    }
    const body = await request.json()
    const {
      name,
      email,
      password,
      consent,
      birthdate,
      analyticsConsent,
      bio,
      city,
      gender,
      paceLevel,
      schedulePreference,
      lat,
      lng,
    } = body

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }
    const passwordProblem = validatePassword(password, email)
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 })
    }
    if (!consent) {
      return NextResponse.json(
        { error: 'You need to accept the data processing terms to use Runsemble' },
        { status: 400 }
      )
    }
    // Age gate. Enforced server-side, not just in the form — a client can send
    // whatever it likes, so the real check has to live here. Fails closed on a
    // missing or unparseable date.
    const dob = typeof birthdate === 'string' && birthdate ? new Date(birthdate) : null
    if (!isOldEnough(dob)) {
      return NextResponse.json(
        { error: `You must be at least ${MIN_AGE} to use Runsemble` },
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
        // Record WHICH policy they accepted, not just when — see lib/consent.
        consentVersion: CURRENT_POLICY_VERSION,
        birthdate: dob,
        // Analytics is its own purpose; only on if the user explicitly opted in.
        analyticsConsent: analyticsConsent === true,
        bio: bio ?? null,
        city: city ?? 'Antwerp',
        // Optional and self-declared; only valid values are stored, anything else
        // is treated as unset. Gates women-only runs (see canJoinAudience).
        gender: (GENDERS as readonly string[]).includes(gender) ? gender : null,
        paceLevel: paceLevel ?? 'beginner',
        // Empty = no preference (the multi-select default), not the old single
        // 'evening'. A user who skips the profile step shouldn't be pre-set to a
        // slot they never chose.
        schedulePreference: typeof schedulePreference === 'string' ? schedulePreference : '',
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        onboardingComplete: true,
        isAvailable: false,
        privacyVisible: true,
      },
    })

    await createSession(user.id)

    // Fire off an email-verification code — best-effort, never block signup.
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
