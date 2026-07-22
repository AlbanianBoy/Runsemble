// POST /api/auth/consent — record that the signed-in user accepted the CURRENT
// privacy policy.
//
// Deliberately its own route rather than a field on the profile PATCH: consent
// is not a preference. It should only ever be settable for yourself, only to the
// version the server considers current (never to an arbitrary string a client
// picked), and it stamps the time alongside — none of which belongs in a generic
// allowlist that gets extended over time.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { CURRENT_POLICY_VERSION } from '@/lib/consent'
import { apiError } from '@/lib/http'

export async function POST() {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    await db.user.update({
      where: { id: me.id },
      // The version comes from the server, not the request body. A client that
      // could name the version could claim agreement to text that never existed.
      data: { consentVersion: CURRENT_POLICY_VERSION, consentAt: new Date() },
    })

    return NextResponse.json({ ok: true, consentVersion: CURRENT_POLICY_VERSION })
  } catch (error) {
    console.error('Error recording consent:', error)
    return apiError(500, 'internal', 'Failed to record consent')
  }
}
