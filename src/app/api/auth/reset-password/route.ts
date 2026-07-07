import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { consumeVerificationCode } from '@/lib/verification'

// Finish a password reset: verify the emailed code, set the new password, and
// sign out everywhere by dropping all of the user's sessions.
export async function POST(request: NextRequest) {
  try {
    const { email, code, password } = await request.json()

    if (!email?.trim() || !code?.trim()) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    })
    // Generic message — don't reveal whether the email exists.
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 400 }
      )
    }

    const check = await consumeVerificationCode(user.id, 'password_reset', code.trim())
    if (!check.ok) {
      return NextResponse.json({ error: check.error ?? 'Invalid or expired code' }, { status: 400 })
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) },
    })
    // Log out every existing session — a reset should end old logins.
    await db.session.deleteMany({ where: { userId: user.id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in reset-password:', error)
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}
