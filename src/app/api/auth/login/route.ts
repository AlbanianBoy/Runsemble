import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { createSession, toSafeUser } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { apiError, readJson } from '@/lib/http'

export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`login:${clientIp(request)}`, 10, 60_000)) {
      return apiError(429, 'rate_limited', 'Too many attempts — wait a minute and try again')
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const email = typeof parsed.body.email === 'string' ? parsed.body.email : ''
    const password = typeof parsed.body.password === 'string' ? parsed.body.password : ''

    if (!email.trim() || !password) {
      return apiError(400, 'missing_field', 'Email and password are required')
    }

    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    // Same error for "no user" and "wrong password" — don't leak which emails exist.
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return apiError(401, 'invalid_credentials', 'Wrong email or password')
    }

    await createSession(user.id)
    return NextResponse.json({ user: toSafeUser(user) })
  } catch (error) {
    console.error('Error logging in:', error)
    return apiError(500, 'internal', 'Failed to log in')
  }
}
