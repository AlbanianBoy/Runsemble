import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const now = new Date()

    const hotspots = await db.hotspot.findMany({
      where: {
        isActive: true,
        startTime: {
          gte: now,
        },
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
      orderBy: { startTime: 'asc' },
    })

    // Add computed fields
    const hotspotsWithMeta = hotspots.map((hotspot) => {
      const msUntil = hotspot.startTime.getTime() - now.getTime()
      const minutesUntil = Math.max(0, Math.round(msUntil / 60000))
      return {
        ...hotspot,
        participantCount: hotspot.participants.length,
        participantNames: hotspot.participants.map((p) => p.user.name),
        minutesUntil,
      }
    })

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
    const body = await request.json()

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
      createdBy,
    } = body

    if (!name || !location || lat === undefined || lng === undefined || !startTime) {
      return NextResponse.json(
        { error: 'name, location, lat, lng, and startTime are required' },
        { status: 400 }
      )
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
        isActive: true,
        createdBy: createdBy ?? null,
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
