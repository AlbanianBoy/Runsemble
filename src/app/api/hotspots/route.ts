import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { LIMITS, overLimit } from '@/lib/limits'
import { sweepHotspotReminders } from '@/lib/hotspot-reminders'
import { SPORT_TYPES, validateEnumFields } from '@/lib/enums'

export async function GET() {
  try {
    const now = new Date()

    // Opportunistically fire "your run starts soon" reminders (throttled, no cron).
    await sweepHotspotReminders()

    // Fetch all active spots; we decide visibility per-spot below so that
    // official recurring spots stay on the board even after a slot passes.
    const hotspots = await db.hotspot.findMany({
      where: { isActive: true },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                paceLevel: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    })

    // Roll a recurring spot forward to its next future slot so curated city
    // spots are perpetually "coming up" rather than expiring.
    function nextByInterval(startTime: Date, intervalMin: number): Date {
      if (startTime.getTime() >= now.getTime() || intervalMin <= 0) return startTime
      const intervalMs = intervalMin * 60_000
      const elapsed = now.getTime() - startTime.getTime()
      const slots = Math.ceil(elapsed / intervalMs)
      return new Date(startTime.getTime() + slots * intervalMs)
    }

    // For weekly official runs (daysOfWeek set), find the next date that falls on
    // one of the scheduled weekdays at the run's time-of-day.
    function nextByWeek(startTime: Date, days: number[]): Date {
      const candidate = new Date(now)
      candidate.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0)
      for (let i = 0; i < 8; i++) {
        const d = new Date(candidate)
        d.setDate(candidate.getDate() + i)
        if (days.includes(d.getDay()) && d.getTime() >= now.getTime()) return d
      }
      return startTime
    }

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    function scheduleLabel(days: number[], startTime: Date, isOfficial: boolean, intervalMin: number): string | null {
      if (!isOfficial) return null
      const time = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (days.length === 7) return `Daily · ${time}`
      if (days.length > 0) return `${days.map((d) => DOW[d]).join(', ')} · ${time}`
      if (intervalMin > 0) return `Every ${intervalMin >= 60 ? `${Math.round(intervalMin / 60)}h` : `${intervalMin} min`}`
      return null
    }

    const hotspotsWithMeta = hotspots
      .map((hotspot) => {
        const isPast = hotspot.startTime.getTime() < now.getTime()
        // User-created one-off runs disappear once they've started; official
        // spots recur forward.
        if (isPast && !hotspot.isOfficial) return null

        const days = (hotspot.daysOfWeek ?? '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)

        const effectiveStart = !hotspot.isOfficial
          ? hotspot.startTime
          : days.length > 0
          ? nextByWeek(hotspot.startTime, days)
          : nextByInterval(hotspot.startTime, hotspot.recurringIntervalMin)

        const msUntil = effectiveStart.getTime() - now.getTime()
        const minutesUntil = Math.max(0, Math.round(msUntil / 60000))
        return {
          ...hotspot,
          startTime: effectiveStart,
          participantCount: hotspot.participants.length,
          participantNames: hotspot.participants.map((p) => p.user.name),
          minutesUntil,
          scheduleLabel: scheduleLabel(days, hotspot.startTime, hotspot.isOfficial, hotspot.recurringIntervalMin),
        }
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort((a, b) => a.minutesUntil - b.minutesUntil)

    return NextResponse.json({ hotspots: hotspotsWithMeta })
  } catch (error) {
    console.error('Error fetching hotspots:', error)
    return NextResponse.json(
      { error: 'Failed to fetch hotspots' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const body = await request.json()

    const invalidEnum = validateEnumFields(body, { sportType: SPORT_TYPES })
    if (invalidEnum) return NextResponse.json({ error: invalidEnum }, { status: 400 })

    const {
      name,
      description,
      location,
      lat,
      lng,
      sportType,
      distanceKm,
      paceRange,
      startTime,
      recurringIntervalMin,
      audience,
    } = body

    if (!name || !location || lat === undefined || lng === undefined || !startTime) {
      return NextResponse.json(
        { error: 'name, location, lat, lng, and startTime are required' },
        { status: 400 }
      )
    }
    if (overLimit(name, LIMITS.groupName) || overLimit(description, LIMITS.groupDesc) || overLimit(location, LIMITS.place)) {
      return NextResponse.json({ error: 'A field is too long' }, { status: 400 })
    }

    const hotspot = await db.hotspot.create({
      data: {
        name,
        description: description ?? null,
        location,
        lat: Number(lat),
        lng: Number(lng),
        sportType: sportType ?? 'running',
        distanceKm: distanceKm ?? 5.0,
        paceRange: paceRange ?? 'any',
        startTime: new Date(startTime),
        recurringIntervalMin: recurringIntervalMin ?? 30,
        audience: audience ?? 'all',
        isActive: true,
        createdBy: me.id,
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                paceLevel: true,
              },
            },
          },
        },
      },
    })

    const now = new Date()
    const msUntil = hotspot.startTime.getTime() - now.getTime()
    const minutesUntil = Math.max(0, Math.round(msUntil / 60000))

    return NextResponse.json(
      {
        hotspot: {
          ...hotspot,
          participantCount: hotspot.participants.length,
          participantNames: hotspot.participants.map((p) => p.user.name),
          minutesUntil,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating hotspot:', error)
    return NextResponse.json(
      { error: 'Failed to create hotspot' },
      { status: 500 }
    )
  }
}
