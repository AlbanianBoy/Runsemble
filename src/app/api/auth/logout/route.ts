import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'
import { apiError } from '@/lib/http'

export async function POST() {
  try {
    await destroySession()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error logging out:', error)
    return apiError(500, 'internal', 'Failed to log out')
  }
}
