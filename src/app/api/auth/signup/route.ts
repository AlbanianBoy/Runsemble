import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, validatePassword } from '@/lib/password'
import { CURRENT_POLICY_VERSION, MIN_AGE, isOldEnough } from '@/lib/consent'
import { GENDERS, PACE_LEVELS, SCHEDULE_PREFERENCES, isOneOf } from '@/lib/enums'
import { createSession, toSafeUser } from '@/lib/auth'
import { createVerificationCode } from '@/lib/verification'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { apiError, readJson } from '@/lib/http'

// Create an account with a real password and start a session.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`signup:${clientIp(request)}`, 5, 60_000)) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body

    const name = typeof body.name === 'string' ? body.name : ''
    const email = typeof body.email === 'string' ? body.email : ''
    const password = body.password
    const consent = body.consent === true
    const birthdate = typeof body.birthdate === 'string' ? body.birthdate : ''
    const analyticsConsent = body.analyticsConsent === true
    const bio = typeof body.bio === 'string' ? body.bio : null
    const city = typeof body.city === 'string' ? body.city : 'Antwerp'
    // The three self-declared profile fields share one rule: a value that isn't
    // in the enum is treated as not given, rather than as an error. Signup is
    // the one request a person cannot retry easily — half of it has side effects
    // (a session, a verification email) — so a stray value from an old client
    // build should cost them a default, not the account.
    //
    // paceLevel had no check at all before this. It was destructured off an
    // untyped body, so `paceLevel: "elite"` typechecked here and then failed
    // inside Prisma as a 500 on the signup path. isOneOf narrows the type, which
    // is what surfaced it.
    const gender = isOneOf(GENDERS, body.gender) ? body.gender : null
    const paceLevel = isOneOf(PACE_LEVELS, body.paceLevel) ? body.paceLevel : 'beginner'
    // Multi-select, stored as a comma-separated string ("morning,evening").
    // Unknown slots are dropped individually so one bad token doesn't discard
    // the good ones alongside it.
    const schedulePreference = (typeof body.schedulePreference === 'string' ? body.schedulePreference : '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => isOneOf(SCHEDULE_PREFERENCES, s))
      .join(',')
    const lat = typeof body.lat === 'number' ? body.lat : null
    const lng = typeof body.lng === 'number' ? body.lng : null

    if (!name.trim() || !email.trim()) {
      return apiError(400, 'missing_field', 'Name and email are required')
    }
    const passwordProblem = validatePassword(password, email)
    if (passwordProblem) {
      return apiError(400, 'invalid_value', passwordProblem)
    }
    if (!consent) {
      return apiError(
        400,
        'missing_field',
        'You need to accept the data processing terms to use Runsemble'
      )
    }
    // Age gate. Enforced server-side, not just in the form — a client can send
    // whatever it likes, so the real check has to live here. Fails closed on a
    // missing or unparseable date.
    const dob = birthdate ? new Date(birthdate) : null
    if (!isOldEnough(dob)) {
      return apiError(400, 'invalid_value', `You must be at least ${MIN_AGE} to use Runsemble`)
    }

    const existing = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (existing) {
      return apiError(
        409,
        'conflict',
        'An account with this email already exists — try logging in'
      )
    }

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: hashPassword(password as string),
        consentAt: new Date(),
        // Record WHICH policy they accepted, not just when — see lib/consent.
        consentVersion: CURRENT_POLICY_VERSION,
        birthdate: dob,
        // Analytics is its own purpose; only on if the user explicitly opted in.
        analyticsConsent,
        bio,
        city,
        // Validated above; gates women-only runs (see canJoinAudience).
        gender,
        paceLevel,
        // Empty = no preference (the multi-select default), not the old single
        // 'evening'. A user who skips the profile step shouldn't be pre-set to a
        // slot they never chose.
        schedulePreference,
        lat,
        lng,
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
    return apiError(500, 'internal', 'Failed to create account')
  }
}
