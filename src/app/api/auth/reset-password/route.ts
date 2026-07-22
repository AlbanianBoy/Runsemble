import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, validatePassword } from '@/lib/password'
import { consumeVerificationCode } from '@/lib/verification'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { apiError, readJson } from '@/lib/http'

// Finish a password reset: verify the emailed code, set the new password, and
// sign out everywhere by dropping all of the user's sessions.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`reset-password:${clientIp(request)}`, 5, 60_000)) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const email = typeof parsed.body.email === 'string' ? parsed.body.email : ''
    const code = typeof parsed.body.code === 'string' ? parsed.body.code : ''
    const password = parsed.body.password

    if (!email.trim() || !code.trim()) {
      return apiError(400, 'missing_field', 'Email and code are required')
    }
    const passwordProblem = validatePassword(password, email)
    if (passwordProblem) {
      return apiError(400, 'invalid_value', passwordProblem)
    }

    const user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    })
    // Generic message — don't reveal whether the email exists.
    if (!user) {
      return apiError(400, 'invalid_value', 'Invalid or expired code')
    }

    const check = await consumeVerificationCode(user.id, 'password_reset', code.trim())
    if (!check.ok) {
      return apiError(400, 'invalid_value', check.error ?? 'Invalid or expired code')
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password as string) },
    })
    // Log out every existing session — a reset should end old logins.
    await db.session.deleteMany({ where: { userId: user.id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in reset-password:', error)
    return apiError(500, 'internal', 'Failed to reset password')
  }
}
