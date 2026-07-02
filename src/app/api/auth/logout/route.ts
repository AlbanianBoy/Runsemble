import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'

export async function POST() {
  try {
    await destroySession()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error logging out:', error)
    return NextResponse.json({ error: 'Failed to log out' }, { status: 500 })
  }
}
