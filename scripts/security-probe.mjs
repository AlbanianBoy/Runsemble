// ─── Security regression probe ────────────────────────────────────────────────
// Exercises the app's access-control invariants against a running dev server and
// the real dev DB, then deletes everything it created. Run it after any API
// change:  npm run dev   (in one terminal)   then   npm run probe
//
// It creates throwaway users/groups/posts (probe_*@runsemble.test), drives the
// HTTP routes as different actors, asserts the responses, and cleans up. Exits
// non-zero if any invariant is violated — wire it into CI when there is one.

import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const PROJECT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { PrismaClient } = await import(pathToFileURL(`${PROJECT}/node_modules/@prisma/client/default.js`).href)
const db = new PrismaClient()

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const stamp = Date.now()
const results = []
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`) }

// Track everything we create so cleanup is exhaustive.
const created = { users: [], groups: [], posts: [] }
async function mkUser(tag, extra = {}) {
  const u = await db.user.create({ data: { name: `Probe ${tag}`, email: `probe_${tag}_${stamp}@runsemble.test`, ...extra } })
  created.users.push(u.id)
  const token = randomBytes(24).toString('hex')
  await db.session.create({ data: { token, userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) } })
  return { id: u.id, token }
}
async function mkGroup(ownerId, isPublic) {
  const g = await db.runGroup.create({ data: { name: `Probe Grp ${stamp}-${created.groups.length}`, isPublic, createdBy: ownerId } })
  created.groups.push(g.id)
  await db.groupMember.create({ data: { groupId: g.id, userId: ownerId, role: 'owner' } })
  return g
}
async function mkPost(authorId, groupId) {
  const p = await db.feedPost.create({ data: { authorId, groupId: groupId ?? null, content: 'probe', postType: 'moment' } })
  created.posts.push(p.id)
  return p
}
const req = (path, token, method = 'GET', body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Cookie: `rs_session=${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
const status = (...a) => req(...a).then((r) => r.status)
const json = (...a) => req(...a).then((r) => r.json())

try {
  // Reachability guard so a down server isn't mistaken for a passing suite.
  await fetch(`${BASE}/api/runs`).catch(() => { throw new Error(`dev server not reachable at ${BASE} — run 'npm run dev' first`) })

  const owner = await mkUser('owner')
  const member = await mkUser('member')
  const outsider = await mkUser('outsider')
  const hidden = await mkUser('hidden', { xp: 99_999_999, privacyVisible: false })

  const priv = await mkGroup(owner.id, false)
  const pub = await mkGroup(owner.id, true)
  await db.groupMember.create({ data: { groupId: priv.id, userId: member.id, role: 'member' } })

  const privPost = await mkPost(owner.id, priv.id)
  const pubPost = await mkPost(owner.id, pub.id)
  const personalPost = await mkPost(owner.id, null)

  // ── Run save idempotency ──
  const cid = `probe-${stamp}`
  const run = { clientRunId: cid, distanceKm: 3, durationSec: 900, companions: 0, buddyIds: [], path: [], splits: [], shareToFeed: false }
  const r1 = await status('/api/runs', owner.token, 'POST', run)
  const r2 = await status('/api/runs', owner.token, 'POST', run)
  const runCount = await db.runSession.count({ where: { clientRunId: cid } })
  check('run save is idempotent on clientRunId', r1 === 201 && r2 === 200 && runCount === 1, `r1=${r1} r2=${r2} rows=${runCount}`)

  // ── Private group is members-only everywhere ──
  check('group chat GET: outsider 403', await status(`/api/groups/${priv.id}/chat`, outsider.token) === 403)
  check('group chat GET: member 200', await status(`/api/groups/${priv.id}/chat`, member.token) === 200)
  check('private group detail: outsider 403', await status(`/api/groups/${priv.id}`, outsider.token) === 403)
  check('private group lobby: outsider 403', await status(`/api/groups/${priv.id}/lobby`, outsider.token) === 403)
  check('private group not in outsider list', !(await json('/api/groups', outsider.token)).groups?.some((g) => g.id === priv.id))
  check('private group not self-joinable', await status(`/api/groups/${priv.id}/join`, outsider.token, 'POST') === 403)

  // ── Add-people (invite) ──
  check('non-member cannot add people', await status(`/api/groups/${priv.id}/members`, outsider.token, 'POST', { userId: outsider.id }) === 403)
  check('member can add people', await status(`/api/groups/${priv.id}/members`, member.token, 'POST', { userId: hidden.id }) === 201)

  // ── Run invites ──
  check('send run invite: 201', await status('/api/invites', owner.token, 'POST', { recipientId: member.id }) === 201)
  check('invite yourself: 400', await status('/api/invites', owner.token, 'POST', { recipientId: owner.id }) === 400)
  const inv = await db.runInvite.findFirst({ where: { senderId: owner.id, recipientId: member.id, status: 'pending' } })
  check('non-recipient cannot answer invite: 403', await status(`/api/invites/${inv?.id}`, outsider.token, 'PATCH', { action: 'accept' }) === 403)
  check('recipient accepts invite: 200', await status(`/api/invites/${inv?.id}`, member.token, 'PATCH', { action: 'accept' }) === 200)

  // ── Feed / comments / likes visibility ──
  const outFeed = (await json('/api/feed?scope=all', outsider.token)).posts?.map((p) => p.id) ?? []
  check('feed hides private-group post from outsider', !outFeed.includes(privPost.id))
  check('feed shows personal + public posts', outFeed.includes(personalPost.id) && outFeed.includes(pubPost.id))
  check('comments GET on private post: outsider 403', await status(`/api/feed/${privPost.id}/comments`, outsider.token) === 403)
  check('like on private post: outsider 403', await status(`/api/feed/${privPost.id}/like`, outsider.token, 'POST') === 403)
  check('feed POST into group needs membership', await status('/api/feed', outsider.token, 'POST', { groupId: priv.id, content: 'x' }) === 403)

  // ── Identity / integrity ──
  await status(`/api/users/${outsider.id}`, outsider.token, 'PATCH', { xp: 42424242, totalRuns: 999 })
  const after = await db.user.findUnique({ where: { id: outsider.id }, select: { xp: true, totalRuns: true } })
  check('user PATCH cannot set xp/totalRuns', after.xp === 0 && after.totalRuns === 0, `xp=${after.xp} runs=${after.totalRuns}`)

  const board = (await json('/api/leaderboard?metric=xp', outsider.token)).entries ?? []
  check('hidden user absent from leaderboard', !board.some((e) => e.id === hidden.id))

  // ── Input caps ──
  check('over-long post rejected 400', await status('/api/feed', owner.token, 'POST', { content: 'x'.repeat(2001) }) === 400)
  check('over-long DM rejected 400', await status('/api/messages', owner.token, 'POST', { recipientId: member.id, content: 'x'.repeat(1001) }) === 400)
} catch (e) {
  check('probe ran without throwing', false, String(e).slice(0, 160))
} finally {
  for (const pid of created.posts) {
    try { await db.postComment.deleteMany({ where: { postId: pid } }) } catch {}
    try { await db.postLike.deleteMany({ where: { postId: pid } }) } catch {}
  }
  // Feed posts by probe users (incl. ones created via the API) + their runs.
  for (const uid of created.users) {
    try { await db.feedPost.deleteMany({ where: { authorId: uid } }) } catch {}
    try { await db.runSession.deleteMany({ where: { userId: uid } }) } catch {}
    try { await db.chatMessage.deleteMany({ where: { OR: [{ senderId: uid }, { recipientId: uid }] } }) } catch {}
  }
  for (const gid of created.groups) {
    try { await db.groupMember.deleteMany({ where: { groupId: gid } }) } catch {}
    try { await db.feedPost.deleteMany({ where: { groupId: gid } }) } catch {}
    try { await db.runGroup.delete({ where: { id: gid } }) } catch {}
  }
  for (const uid of created.users) {
    try { await db.runInvite.deleteMany({ where: { OR: [{ senderId: uid }, { recipientId: uid }] } }) } catch {}
    try { await db.notification.deleteMany({ where: { OR: [{ userId: uid }, { actorId: uid }] } }) } catch {}
    try { await db.block.deleteMany({ where: { OR: [{ blockerId: uid }, { blockedId: uid }] } }) } catch {}
    try { await db.session.deleteMany({ where: { userId: uid } }) } catch {}
    try { await db.user.delete({ where: { id: uid } }) } catch {}
  }
  const leftover = await db.user.count({ where: { email: { contains: `_${stamp}@runsemble.test` } } })
  await db.$disconnect()
  const passed = results.length > 0 && results.every((r) => r.ok) && leftover === 0
  console.log(`\ncleanup: ${leftover === 0 ? 'all probe rows deleted' : `${leftover} LEFTOVER`}`)
  console.log(`${passed ? '✅ SECURITY PROBE PASSED' : '❌ SECURITY PROBE FAILED'} (${results.filter((r) => r.ok).length}/${results.length})`)
  process.exit(passed ? 0 : 1)
}
