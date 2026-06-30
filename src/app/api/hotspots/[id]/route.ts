import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const hotspot = await db.hotspot.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                bio: true,
                paceLevel: true,
                preferredSport: true,
                totalRuns: true,
                streak: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        ratings: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!hotspot) {
      return NextResponse.json(
        { error: 'Hotspot not found' },
        { status: 404 }
      )
    }

    const now = new Date()
    const msUntil = hotspot.startTime.getTime() - now.getTime()
    const minutesUntil = Math.max(0, Math.round(msUntil / 60000))

    const result = {
      ...hotspot,
      participantCount: hotspot.participants.length,
      participantNames: hotspot.participants.map((p) => p.user.name),
      minutesUntil,
    }

    return NextResponse.json({ hotspot: result })
  } catch (error) {
    console.error('Error fetching hotspot:', error)
    return NextResponse.json(
      { error: 'Failed to fetch hotspot' },
      { status: 500 }
    )
  }
}
