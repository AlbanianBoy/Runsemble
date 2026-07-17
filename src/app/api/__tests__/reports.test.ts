import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── Reporting and moderation ─────────────────────────────────────────────────
// Block only hides someone from the reporter. A report is what reaches an
// operator, and for an app that puts strangers in the same park that queue is a
// safety requirement. These pin the guards on filing one and on who can action it.

let overrides: DbOverrides = {}
const { db } = makeDb(
  new Proxy({} as DbOverrides, {
    get: (_t, k: string) => overrides[k],
    has: (_t, k: string) => k in overrides,
    ownKeys: () => Reflect.ownKeys(overrides),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })
)
vi.mock('@/lib/db', () => ({ db }))

const getSessionUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionUser,
}))

const getAdminUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/admin', () => ({ getAdminUser, isAdminEmail: () => false }))

const ME = { id: 'u1', name: 'Arian', email: 'a@b.c' }

// Each test brings its own IP so the per-account rate limiter doesn't bleed over.
let ip = 0
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/reports', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ip}` },
  })

const REPORT = { subjectType: 'user', subjectId: 'u2', reason: 'harassment', details: 'creepy at the meetup' }

beforeEach(() => {
  getSessionUser.mockReset()
  getAdminUser.mockReset()
  getSessionUser.mockResolvedValue(ME)
  overrides = {
    // Subject exists by default (the snapshot lookup).
    'user.findUnique': () => ({ id: 'u2', name: 'Bart', bio: 'runner', city: 'Antwerp' }),
    'report.upsert': () => ({ id: 'r1' }),
  }
})

describe('POST /api/reports', () => {
  it('files a report on a valid subject', async () => {
    const { POST } = await import('@/app/api/reports/route')
    expect((await POST(post(REPORT))).status).toBe(201)
  })

  it('is 401 for an anonymous caller', async () => {
    getSessionUser.mockResolvedValue(null)
    const { POST } = await import('@/app/api/reports/route')
    expect((await POST(post(REPORT))).status).toBe(401)
  })

  it('rejects an unknown subjectType', async () => {
    const { POST } = await import('@/app/api/reports/route')
    expect((await POST(post({ ...REPORT, subjectType: 'planet' }))).status).toBe(400)
  })

  it('rejects an unknown reason', async () => {
    const { POST } = await import('@/app/api/reports/route')
    expect((await POST(post({ ...REPORT, reason: 'vibes' }))).status).toBe(400)
  })

  it('will not let you report yourself', async () => {
    const { POST } = await import('@/app/api/reports/route')
    expect((await POST(post({ ...REPORT, subjectId: 'u1' }))).status).toBe(400)
  })

  it('404s when the subject does not exist — a report on nothing is noise', async () => {
    overrides['user.findUnique'] = () => null
    const { POST } = await import('@/app/api/reports/route')
    expect((await POST(post(REPORT))).status).toBe(404)
  })

  it('snapshots the subject content, so a later deletion is still reviewable', async () => {
    let created: { create?: { evidence?: string } } = {}
    overrides['report.upsert'] = (a: unknown) => ((created = a as typeof created), { id: 'r1' })

    const { POST } = await import('@/app/api/reports/route')
    await POST(post(REPORT))

    const snap = JSON.parse(created.create!.evidence!)
    expect(snap).toMatchObject({ id: 'u2', name: 'Bart' })
  })

  it('upserts on (reporter, subject), so one person cannot flood the queue', async () => {
    let where: unknown = null
    overrides['report.upsert'] = (a: unknown) => ((where = (a as { where: unknown }).where), { id: 'r1' })

    const { POST } = await import('@/app/api/reports/route')
    await POST(post(REPORT))

    expect(where).toEqual({
      reporterId_subjectType_subjectId: { reporterId: 'u1', subjectType: 'user', subjectId: 'u2' },
    })
  })

  it('rate-limits a flood of reports from one account', async () => {
    const { POST } = await import('@/app/api/reports/route')
    const sameIp = '198.51.100.9'
    const req = () =>
      new NextRequest('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify(REPORT),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': sameIp },
      })
    // Limit is 20/hour.
    for (let i = 0; i < 20; i++) expect((await POST(req())).status).toBe(201)
    expect((await POST(req())).status).toBe(429)
  })
})

describe('PATCH /api/reports/[id]', () => {
  const patch = (body: unknown) =>
    new NextRequest('http://localhost/api/reports/r1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  const params = Promise.resolve({ id: 'r1' })

  beforeEach(() => {
    getAdminUser.mockResolvedValue({ id: 'admin1', email: 'ops@runsemble.app' })
    overrides['report.updateMany'] = () => ({ count: 1 })
  })

  it('lets an operator resolve a report and records who did it', async () => {
    let data: { resolvedById?: string; status?: string; resolvedAt?: Date } = {}
    overrides['report.updateMany'] = (a: unknown) => ((data = (a as { data: typeof data }).data), { count: 1 })

    const { PATCH } = await import('@/app/api/reports/[id]/route')
    const res = await PATCH(patch({ status: 'resolved' }), { params })

    expect(res.status).toBe(200)
    expect(data.status).toBe('resolved')
    expect(data.resolvedById).toBe('admin1') // audit trail
    expect(data.resolvedAt).toBeInstanceOf(Date)
  })

  it('clears the resolver when a report is reopened', async () => {
    let data: { resolvedById?: string | null } = {}
    overrides['report.updateMany'] = (a: unknown) => ((data = (a as { data: typeof data }).data), { count: 1 })

    const { PATCH } = await import('@/app/api/reports/[id]/route')
    await PATCH(patch({ status: 'reviewing' }), { params })

    expect(data.resolvedById).toBeNull()
  })

  it('is 403 for a non-admin', async () => {
    getAdminUser.mockResolvedValue(null)
    const { PATCH } = await import('@/app/api/reports/[id]/route')
    expect((await PATCH(patch({ status: 'resolved' }), { params })).status).toBe(403)
  })

  it('rejects an unknown status', async () => {
    const { PATCH } = await import('@/app/api/reports/[id]/route')
    expect((await PATCH(patch({ status: 'banished' }), { params })).status).toBe(400)
  })

  it('404s when the report does not exist', async () => {
    overrides['report.updateMany'] = () => ({ count: 0 })
    const { PATCH } = await import('@/app/api/reports/[id]/route')
    expect((await PATCH(patch({ status: 'resolved' }), { params })).status).toBe(404)
  })
})
