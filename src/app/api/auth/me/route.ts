import { NextResponse } from 'next/server'
import { getSessionUser, toSafeUser } from '@/lib/auth'

// Who am I? Restores the logged-in user from the session cookie.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    return NextResponse.json({ user: toSafeUser(user) })
  } catch (error) {
    console.error('Error resolving session:', error)
    return NextResponse.json({ error: 'Failed to resolve session' }, { status: 500 })
  }
}
