import { NextResponse } from 'next/server'
import { getSessionUser, toSafeUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

// Who am I? Restores the logged-in user from the session cookie.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return apiError(401, 'unauthenticated', 'Not logged in')
    return NextResponse.json({ user: toSafeUser(user) })
  } catch (error) {
    console.error('Error resolving session:', error)
    return apiError(500, 'internal', 'Failed to resolve session')
  }
}
