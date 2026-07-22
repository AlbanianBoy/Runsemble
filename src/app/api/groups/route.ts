import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { LIMITS, overLimit } from '@/lib/limits'
import { apiError, readJson } from '@/lib/http'

// ─── Group discovery ─────────────────────────────────────────────────────────
// Two lists, not one. Groups you're IN are always returned in full: one you
// belong to must never fall off because you moved city or because it sat past a
// page boundary. Groups you might JOIN are scoped to your city, ordered newest
// first, and paginated — that half used to load every group in the database,
// with every member row and every member's user row, on every tab open, and
// then throw the private ones away in JavaScript afterwards.
//
// Newest-first is deliberate over most-members: it's the order a keyset cursor
// can page stably (memberCount moves under you), and a brand-new group is the
// one that actually needs to be found.
const DISCOVER_PAGE = 20
const MAX_QUERY = 60

export async function GET(request: NextRequest) {
  try {
    // Membership flags come from the session, not a client-claimed id.
    const me = await getSessionUser()
    const userId = me?.id ?? null

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY)
    const cursor = url.searchParams.get('cursor')

    // The list shows a member *count* and a weekly-km total, never a member's
    // name or face — those live on the detail screen, behind its own request.
    // So take the ids the km stat needs and let the database do the counting;
    // pulling every member's user row to call .length on the array was most of
    // this endpoint's payload.
    const memberInclude = {
      members: { select: { userId: true } },
      _count: { select: { chatMessages: true, members: true } },
    } as const

    // Yours: unbounded on purpose. Nobody is in hundreds of running groups, and
    // hiding one behind a "load more" would be a bug, not a saving. Only on the
    // first page though — a cursor means "more Discover, please", and repeating
    // your groups on every page would duplicate them in the flattened list.
    const mine = userId && !cursor
      ? await db.runGroup.findMany({
          where: { members: { some: { userId } } },
          include: memberInclude,
          orderBy: { createdAt: 'desc' },
        })
      : []
    const mineIds = new Set(mine.map((g) => g.id))

    // Theirs: public only — private groups aren't discoverable by name+members,
    // which mirrors the members-only detail/chat/lobby. Searching by name means
    // you already know what you're after, so a search ignores the city scope;
    // browsing does not.
    const discoverWhere = {
      isPublic: true,
      ...(userId ? { members: { none: { userId } } } : {}),
      ...(q
        ? { name: { contains: q, mode: 'insensitive' as const } }
        : me?.city
          ? { city: me.city }
          : {}),
    }

    const discoverPage = await db.runGroup.findMany({
      where: discoverWhere,
      include: memberInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: DISCOVER_PAGE + 1, // one extra: its existence is the "more" signal
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    const hasMore = discoverPage.length > DISCOVER_PAGE
    const discover = hasMore ? discoverPage.slice(0, DISCOVER_PAGE) : discoverPage

    const groups = [...mine, ...discover]

    // Honest stat: "km this week" is computed from members' real tracked runs
    // since Monday. There is no stored counter to fall out of date. Scoped to
    // the members actually on screen — this used to aggregate every run in the
    // database by every user, whether or not they were in a listed group.
    const memberIds = [...new Set(groups.flatMap((g) => g.members.map((m) => m.userId)))]
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const weekly = memberIds.length
      ? await db.runSession.groupBy({
          by: ['userId'],
          where: { userId: { in: memberIds }, endedAt: { gte: weekStart } },
          _sum: { distanceKm: true },
        })
      : []
    const kmByUser = new Map(weekly.map((w) => [w.userId, w._sum.distanceKm ?? 0]))

    const withMeta = groups.map((group) => ({
      ...group,
      memberCount: group._count.members,
      messageCount: group._count.chatMessages,
      totalKmThisWeek:
        Math.round(group.members.reduce((s, m) => s + (kmByUser.get(m.userId) ?? 0), 0) * 10) / 10,
      isMember: mineIds.has(group.id),
      _count: undefined,
    }))

    return NextResponse.json({
      groups: withMeta,
      nextCursor: hasMore ? discover[discover.length - 1]!.id : null,
      // Tells the client whether an empty Discover means "none here" or
      // "none matching" — the two need different empty states.
      scopedToCity: !q && me?.city ? me.city : null,
    })
  } catch (error) {
    console.error('Error fetching groups:', error)
    return apiError(500, 'internal', 'Failed to fetch groups')
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const createdBy = me.id

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    const name = typeof body.name === 'string' ? body.name : ''
    const description = typeof body.description === 'string' ? body.description : null
    const isPublic = body.isPublic !== false // default true, as before
    const coverImage = typeof body.coverImage === 'string' ? body.coverImage : null
    const city = typeof body.city === 'string' ? body.city : 'Antwerp'

    if (!name.trim()) {
      return apiError(400, 'missing_field', 'Group name is required')
    }
    if (overLimit(name, LIMITS.groupName) || overLimit(description, LIMITS.groupDesc)) {
      return apiError(400, 'too_long', 'Group name or description is too long')
    }

    const group = await db.runGroup.create({
      data: {
        name,
        description,
        isPublic,
        coverImage,
        city,
        createdBy,
        members: {
          create: {
            userId: createdBy,
            role: 'owner',
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ group }, { status: 201 })
  } catch (error) {
    console.error('Error creating group:', error)
    return apiError(500, 'internal', 'Failed to create group')
  }
}
