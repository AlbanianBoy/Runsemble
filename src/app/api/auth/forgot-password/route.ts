import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createVerificationCode } from '@/lib/verification'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { apiError, readJson } from '@/lib/http'

// Start a password reset: if the email belongs to a real account, email a code.
// Always responds 200 with the same body so this can't be used to probe which
// emails have accounts.
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`forgot:${clientIp(request)}`, 5, 60_000))) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const email = typeof parsed.body.email === 'string' ? parsed.body.email : ''

    if (!email.trim()) {
      return apiError(400, 'missing_field', 'Email is required')
    }

    const user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    })

    // Only send for accounts that actually have a password set.
    if (user?.passwordHash) {
      try {
        const code = await createVerificationCode(user.id, 'password_reset')
        await sendPasswordResetEmail(user.email, code)
      } catch (err) {
        console.error('Error sending reset code:', err)
        // Fall through to the generic success response — don't leak failures.
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in forgot-password:', error)
    return apiError(500, 'internal', 'Something went wrong')
  }
}
