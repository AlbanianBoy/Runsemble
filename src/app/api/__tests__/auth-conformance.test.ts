import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ─── Every route is authenticated unless it is on this list ──────────────────
//
// The audit's wording was "correct today, one forgotten check from a hole", and
// that is exactly the kind of defect a helper does not prevent: a new route with
// no getSessionUser() call looks completely normal in review, ships, and is a
// hole. Nothing fails. Nothing logs.
//
// So the check is mechanical. This walks every handler exported from every
// route.ts and fails unless it either gates itself or appears below with a
// reason. Adding a public endpoint stays possible; adding one BY ACCIDENT does
// not, because the test names the file and asks you to justify it.
//
// A gate is any of: a session lookup (getSessionUser / getAdminUser), the cron
// shared secret, or a production kill-switch.

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** `route.ts:METHOD` entries that are deliberately reachable without a session. */
const PUBLIC: Record<string, string> = {
  // Auth entry points: by definition there is no session yet. Each is rate
  // limited by IP instead — see the checkRateLimit call at the top of them.
  'auth/login/route.ts:POST': 'signing in — no session exists yet',
  'auth/signup/route.ts:POST': 'creating the account that a session would belong to',
  'auth/logout/route.ts:POST': 'clearing a cookie must work even with a dead session',
  'auth/forgot-password/route.ts:POST': 'reached precisely because the user cannot log in',
  'auth/reset-password/route.ts:POST': 'the emailed token is the credential',
  'auth/verify-email/route.ts:POST': 'the emailed code is the credential',
  'auth/send-verification/route.ts:POST': 'resending that code, pre-verification',
  // Development-only, and refuses to run when NODE_ENV is production.
  'seed/route.ts:POST': 'demo data; hard-refuses in production',
  // A tombstone: returns 410 unconditionally and touches no data. Account
  // creation moved to /api/auth/signup.
  'users/route.ts:POST': 'always 410 Gone — reads and writes nothing',
  // The live-run watcher. By design they have no account — a worried partner or
  // parent opens the link in whatever browser they have. The unguessable token
  // is the credential, and the response is narrowed to first-name-plus-position
  // by toPublicRunShare.
  'run-shares/[token]/route.ts:GET': 'the watcher has no session by design — the token is the credential',
  // Basemap tile proxy. Serves only public OpenStreetMap raster tiles by grid
  // coordinate — no user data is reachable — and must load for the map before
  // anything else, so gating it on a session would just add latency to every tile.
  'map/tile/[z]/[x]/[y]/route.ts:GET': 'serves public OSM tiles by coordinate; touches no user data',
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

/**
 * Body of an exported handler, by brace matching.
 *
 * The parameter list has to be stepped over first. Next's dynamic routes are
 * declared `POST(request, { params }: { params: Promise<{ id: string }> })`, so
 * the first `{` after the function name belongs to a destructured argument, not
 * the body — matching from there returns `{ params }` and every such handler
 * reads as having no auth check. That produced 32 false positives on the first
 * run of this test, which is a good argument for never trusting a security
 * check that has not been seen to fail correctly.
 */
function handlerBody(src: string, method: string): string | null {
  const signature = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`)
  const start = src.search(signature)
  if (start === -1) return null

  // Walk the parameter list to its matching ')'.
  const paramsOpen = src.indexOf('(', start)
  if (paramsOpen === -1) return null
  let parens = 0
  let paramsClose = -1
  for (let i = paramsOpen; i < src.length; i++) {
    if (src[i] === '(') parens++
    else if (src[i] === ')') {
      parens--
      if (parens === 0) {
        paramsClose = i
        break
      }
    }
  }
  if (paramsClose === -1) return null

  const open = src.indexOf('{', paramsClose)
  if (open === -1) return null

  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return src.slice(open)
}

const GATES = [
  'getSessionUser',
  'getAdminUser',
  'CRON_SECRET',
  // The seed route's production kill-switch.
  "NODE_ENV === 'production'",
]

describe('API auth conformance', () => {
  const files = routeFiles(API_ROOT)

  it('finds the route files at all (a broken walk would vacuously pass)', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('gates every exported handler, or names it public with a reason', () => {
    const ungated: string[] = []

    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      const rel = relative(API_ROOT, file).split(sep).join('/')

      for (const method of METHODS) {
        const body = handlerBody(src, method)
        if (body === null) continue

        const key = `${rel}:${method}`
        if (key in PUBLIC) continue
        if (GATES.some((gate) => body.includes(gate))) continue

        ungated.push(key)
      }
    }

    // The message is the point: it tells whoever broke this exactly what to do.
    expect(
      ungated,
      `These handlers are reachable with no session and are not on the PUBLIC list.\n` +
        `Either add a getSessionUser() check, or add an entry to PUBLIC in this file\n` +
        `with a one-line reason it is safe:\n` +
        ungated.map((u) => `  '${u}': '...',`).join('\n')
    ).toEqual([])
  })

  it('keeps the PUBLIC list honest — no entry for a handler that no longer exists', () => {
    // A stale exemption is worse than none: it silently pre-approves whatever
    // gets written at that path next.
    const stale: string[] = []
    for (const key of Object.keys(PUBLIC)) {
      const [rel, method] = key.split(':')
      const file = join(API_ROOT, ...rel!.split('/'))
      let src: string
      try {
        src = readFileSync(file, 'utf8')
      } catch {
        stale.push(`${key} (file is gone)`)
        continue
      }
      if (handlerBody(src, method!) === null) stale.push(`${key} (handler is gone)`)
    }
    expect(stale).toEqual([])
  })
})
