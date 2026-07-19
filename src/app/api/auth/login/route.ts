import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { createSession, toSafeUser } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    if (!await rateLimit(`login:${clientIp(request)}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts — wait a minute and try again' }, { status: 429 })
    }
    const { email, password } = await request.json()
    if (!email?.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    // Same error for "no user" and "wrong password" — don't leak which emails exist.
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 })
    }

    await createSession(user.id)
    return NextResponse.json({ user: toSafeUser(user) })
  } catch (error) {
    console.error('Error logging in:', error)
    return NextResponse.json({ error: 'Failed to log in' }, { status: 500 })
  }
}
