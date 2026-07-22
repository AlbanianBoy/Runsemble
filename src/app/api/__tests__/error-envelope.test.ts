import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ─── The request boundary, enforced mechanically ─────────────────────────────
// Two rules that are easy to state and impossible to remember at three in the
// morning while adding a route, so they are checked instead of trusted.
//
// 1. A malformed body is a CLIENT error. `await request.json()` inside a
//    try/catch whose catch returns 500 turns bad input into "server error":
//    it tells the caller the wrong thing and fills Sentry with incidents that
//    are nobody's fault but the sender's. readJson() returns a 400 instead.
//
// 2. Errors carry a machine-readable code. Clients that need to branch on a
//    failure otherwise match on the prose — this codebase had exactly that, a
//    component checking `.includes('already')`, which breaks the moment anyone
//    rewords a sentence.

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

const rel = (f: string) => relative(API_ROOT, f).split(sep).join('/')

describe('request boundary', () => {
  const files = routeFiles(API_ROOT)

  it('finds the routes (a broken walk would vacuously pass)', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('gives every error response a machine-readable code', () => {
    // `NextResponse.json({ error }, { status })` emits a sentence and nothing a
    // client can branch on. apiError() emits both. The prose belongs to the
    // person reading it; the code is the part a client may depend on.
    const offenders: { file: string; count: number }[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      // Multiline, because the long ones wrap across several lines.
      const bare = src.match(/NextResponse\.json\(\s*\{\s*error:/g)?.length ?? 0
      if (bare > 0) offenders.push({ file: rel(file), count: bare })
    }

    const total = offenders.reduce((n, o) => n + o.count, 0)
    expect(
      offenders,
      [
        `${total} error responses carry no code. Replace with apiError() from @/lib/http:`,
        `  return apiError(404, 'not_found', 'Group not found')`,
        `Keep the status and the human sentence EXACTLY as they are — this adds a`,
        `field, it does not redesign the API.`,
        '',
        ...offenders.map((o) => `  ${o.file} (${o.count})`),
      ].join('\n')
    ).toEqual([])
  })

  it('never lets a malformed body become a 500', () => {
    // Either readJson(), or an explicit .catch() that turns the parse failure
    // into a handled value. A bare `await request.json()` is the bug.
    const offenders: string[] = []
    for (const file of files) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const bare = /await\s+req(uest)?\.json\(\)/.test(line) && !line.includes('.catch(')
        if (bare) offenders.push(`${rel(file)}: ${line.trim()}`)
      }
    }

    expect(
      offenders,
      'These parse a request body without handling malformed JSON, so bad input\n' +
        'returns 500 instead of 400. Use readJson() from @/lib/http:\n' +
        '  const parsed = await readJson(request)\n' +
        '  if (!parsed.ok) return parsed.response\n\n' +
        offenders.map((o) => `  ${o}`).join('\n')
    ).toEqual([])
  })
})
