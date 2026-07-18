// /api/safe-zones — the caller's own safe zones. Strictly session-scoped: a
// zone centre is a home address, so there is no path — none — that returns
// another user's zones. Suppression happens server-side in toPublicUser; these
// endpoints only manage the list.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { MAX_SAFE_ZONES, clampZoneRadius } from '@/lib/safe-zones'
import { LIMITS, overLimit } from '@/lib/limits'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

  const zones = await db.safeZone.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, lat: true, lng: true, radiusM: true, createdAt: true },
  })
  return NextResponse.json({ zones })
}

export async function POST(request: NextRequest) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const lat = Number(body?.lat)
  const lng = Number(body?.lng)
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'Home'

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'A valid lat/lng is required' }, { status: 400 })
  }
  if (overLimit(name, LIMITS.name)) {
    return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
  }

  // A cap, so the list stays a set of places rather than a blanket over the city.
  const count = await db.safeZone.count({ where: { userId: me.id } })
  if (count >= MAX_SAFE_ZONES) {
    return NextResponse.json(
      { error: `You can have up to ${MAX_SAFE_ZONES} safe zones` },
      { status: 400 }
    )
  }

  const zone = await db.safeZone.create({
    data: { userId: me.id, name, lat, lng, radiusM: clampZoneRadius(body?.radiusM) },
    select: { id: true, name: true, lat: true, lng: true, radiusM: true, createdAt: true },
  })
  return NextResponse.json({ zone }, { status: 201 })
}
