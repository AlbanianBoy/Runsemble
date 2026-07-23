# Handoff — finish H42 (share-my-run live link + SOS)

You are picking up a feature that is **half-built**. The data layer and the core
library are done, tested, and correct — **do not touch them**. What remains is
the API routes, the public watch page, and wiring a few controls into the run
tracker. This document is self-contained: every contract you need is written out
below so you don't have to guess signatures.

## The app (context)

Runsemble — a social running app. **Next.js 16 (App Router, Turbopack) + React 19
+ TypeScript (strict) + Prisma + Postgres (Neon) + Tailwind v4**, deployed on
Vercel (region `fra1`), also wrapped as a Capacitor app. Tests are **vitest**.

**House style — this matters as much as correctness:**
- Files open with a `// ─── Title ─────` banner comment, then 5–15 lines of prose
  explaining *why* the file exists and any non-obvious decision. Comments explain
  **why**, never restate the code. Match the neighbours.
- Lint is **strict**: no unused vars/imports, no `any`, no non-null `!` where a
  guard reads better. **React Compiler lint forbids `setState` in an effect body
  that runs on every render** — use refs + intervals like the existing GPS effects.
- All API errors go through `apiError(status, code, message)` from `@/lib/http`.
  The `code` must come from a **closed union** (listed below) — you may not invent one.
- Request bodies are read with `readJson(request)` from `@/lib/http` (never a bare
  `await request.json()` — that throws a 500 on a truncated body).
- Auth: `const me = await getSessionUser()` from `@/lib/auth`; `null` → `apiError(401,'unauthenticated','Please log in')`.
- Rate limiting: `checkRateLimit(key, limit, windowMs)`, `userKey(bucket, userId)`,
  `clientIp(request)` from `@/lib/rate-limit`. It returns a boolean and fails *open*.
- Prisma client: `import { db } from '@/lib/db'`.

**Valid `ERROR_CODES`** (use only these): `malformed_json`, `missing_field`,
`invalid_value`, `too_long`, `unauthenticated`, `invalid_credentials`, `forbidden`,
`email_unverified`, `not_found`, `precondition_failed`, `conflict`, `unprocessable`,
`rate_limited`, `gone`, `internal`.

## What the feature does

A runner going out at night taps **"Share live"** mid-run. The app mints an
unguessable token and gives them a URL `/watch/<token>` they send to whoever they
trust, over their own messenger. That person opens it in any browser — **no
Runsemble account** — and watches a dot move on a map. The runner can raise an
**SOS**, which flags the share so a watcher with the page open sees an alarm. The
link dies when the run is saved, when the runner revokes it, or at a hard **4-hour
expiry** — whichever comes first.

**Five deliberate design decisions — keep them, don't "improve" them:**
1. **The position shown is EXACT.** The app's safe-zone blinding and 200 m
   grid-fuzz are deliberately **not** applied here — a contact sent to a blurred
   cell can't find anyone. It's bounded instead: opt-in, one run, revocable,
   short-lived. (Already documented in `run-share.ts`.)
2. **The URL is the credential** → token is 32 random bytes, not a cuid.
3. **Watch page + its API are `noindex` + `no-store`.**
4. **SOS is honest**: it flags the share; it does **not** phone anyone. Copy shown
   to the runner must say so and point at **112**.
5. **One active share per runner.** Creating a share while one is live returns the
   **same** token (one run, one link, one thing to revoke).

---

## ✅ ALREADY DONE — do not rebuild, do not edit

| File | State |
|---|---|
| `prisma/schema.prisma` — `RunShare` model + `runShares RunShare[]` on User | ✅ done |
| `prisma/migrations/20260724090000_run_shares/migration.sql` | ✅ done |
| `src/lib/run-share.ts` — the pure lifecycle/projection library | ✅ done + 31 tests |
| `src/lib/__tests__/run-share.test.ts` | ✅ done |
| `src/app/api/cron/coarsen-runs/route.ts` — 24 h purge of dead share rows folded in | ✅ done |
| `src/app/api/run-shares/route.ts` — GET/POST/DELETE | ✅ done |
| `src/app/api/run-shares/beacon/route.ts` — POST | ✅ done |
| `src/app/api/run-shares/[token]/route.ts` — public GET | ✅ done |
| `src/app/api/run-shares/active-share.ts` — shared `where` + summary select | ✅ done |
| `src/app/api/__tests__/run-shares.test.ts` — 10 route tests | ✅ done |
| `src/app/api/__tests__/auth-conformance.test.ts` — public-route allowlist entry | ✅ done |

> **API contract note (matters for the client you build):** `DELETE /api/run-shares`
> sets **`endedAt` only** (not `revokedAt`), so a normal run-finish shows the
> watcher status **`ended`** ("the run is over"), not `revoked` ("cut off"). The
> beacon returns `{ active: number }` — **when it returns `0`, stop beaconing and
> clear local share state** (the share died server-side). `POST /api/run-shares`
> returns `{ share, created }` — `created:false` + HTTP 200 means you got the
> existing live share back; `created:true` + HTTP 201 means a new one.

### The exact exports of `src/lib/run-share.ts` (build the API against these)

```ts
export const SHARE_TTL_MS: number        // 4h in ms — set expiresAt = now + this
export const STALE_AFTER_MS: number      // 3 min
export const BEACON_INTERVAL_MS: number  // 20_000 — the client's beacon cadence

export function newShareToken(): string  // 32 random bytes, base64url

export type ShareStatus = 'live' | 'stale' | 'ended' | 'expired' | 'revoked'

export interface ShareLifecycle {
  expiresAt: Date; endedAt: Date | null; revokedAt: Date | null; lastPingAt: Date | null
}
export function shareStatus(row: ShareLifecycle, now: number): ShareStatus
export function positionVisible(status: ShareStatus): boolean  // true for live|stale only
export function firstName(name: string): string

export interface PublicRunShareRow extends ShareLifecycle {
  sosAt: Date | null; lat: number | null; lng: number | null; accuracyM: number | null
  distanceKm: number; durationSec: number; createdAt: Date
  user: { name: string; avatar: string | null }
}
export interface PublicRunShare {
  status: ShareStatus
  runner: { name: string; avatar: string | null }   // FIRST NAME ONLY
  sos: boolean
  sosAt: string | null
  position: { lat: number; lng: number; accuracyM: number | null; at: string } | null
  distanceKm: number
  durationSec: number
  startedAt: string
  expiresAt: string
}
export function toPublicRunShare(row: PublicRunShareRow, now: number): PublicRunShare
```

The `RunShare` table columns: `id, token, userId, createdAt, expiresAt, endedAt,
revokedAt, sosAt, lat, lng, accuracyM, lastPingAt, distanceKm, durationSec`.

**The "active share" predicate is exactly:** `endedAt = null AND revokedAt = null
AND expiresAt > now`. Write it once and reuse it in all three routes so they can't
drift apart.

---

## ✅ H42 IS COMPLETE

Everything below (sections 1–5) is now built, verified (typecheck ×2, lint, 455
tests, `next build`) and committed. The watch page render was confirmed in the
browser. Nothing here is left to do except **`git push`** and, once merged,
**`npx prisma migrate deploy`** to apply the `run_shares` migration. The only
remaining verification is the live end-to-end flow on a real device (create a
share, watch the dot move, raise SOS) — that needs GPS and can't be done from a
desktop. Sections 1–5 are kept as a record of what shipped.

### 1. API routes — ✅ BUILT

**`src/app/api/run-shares/route.ts`** — `GET`, `POST`, `DELETE`:
- **GET** (auth): return the caller's one active share, or null.
  `-> { share: { id, token, expiresAt, sosAt } | null }`
- **POST** (auth, no body needed): rate-limit `userKey('run-share-create', me.id)`,
  10 per hour. If an active share already exists, **return it unchanged** with
  HTTP **200** and `created:false`. Otherwise create one (`token: newShareToken()`,
  `expiresAt: new Date(Date.now() + SHARE_TTL_MS)`) and return HTTP **201** with
  `created:true`. Shape: `{ share: { id, token, expiresAt, sosAt }, created }`.
- **DELETE** (auth): end **every** active share for the caller — set `endedAt = now`
  and `revokedAt = now` on the ones not already ended. **Idempotent**: ending
  nothing is `{ ended: 0 }` with HTTP 200, never a 404. `-> { ended: number }`.

**`src/app/api/run-shares/beacon/route.ts`** — `POST` (auth):
- Body `{ lat, lng, accuracyM?, distanceKm, durationSec, sos? }`.
- Validate: `lat` in `[-90,90]`, `lng` in `[-180,180]`, both finite → else
  `apiError(400,'invalid_value',…)`. `distanceKm`/`durationSec` finite & ≥ 0.
  `sos` must be boolean or absent.
- Rate-limit `userKey('run-share-beacon', me.id)`, 40 per minute.
- `updateMany` over the caller's **active** shares, setting `lat, lng, accuracyM,
  lastPingAt = now, distanceKm, durationSec`.
- If `sos === true`: a **second, separate** `updateMany` scoped to active shares
  **where `sosAt = null`**, setting `sosAt = now`. (Never overwrite the first
  alarm's time — do it as its own query, don't try to express it in one.)
- Return `{ active: number }` = how many rows the position update touched. When
  it's 0 (share died server-side, or a revoke/ping race) that is **not an error** —
  return `{ active: 0 }` so the client knows to stop. Never 4xx/5xx on 0.

**`src/app/api/run-shares/[token]/route.ts`** — `GET`, **PUBLIC (no session)**:
- Next 16: `{ params }: { params: Promise<{ token: string }> }`, `await` it.
- Rate-limit on `clientIp(request) + ':' + token`, 120 per minute.
- Look up by token, `select`/`include` **only** the columns `toPublicRunShare`
  needs (`user: { select: { name, avatar } }` — never widen this).
- Unknown token → `apiError(404,'not_found','That link is no longer active')`.
  Return the **same 404** for never-existed and revoked — do not distinguish.
- Return `toPublicRunShare(row, Date.now())`.
- **Response headers MUST include** `Cache-Control: no-store` and
  `X-Robots-Tag: noindex, nofollow`. (Use `NextResponse.json(payload, { headers: {…} })`.)

**`src/app/api/__tests__/auth-conformance.test.ts`** — this test walks every route
and fails unless each handler is authenticated or on an allowlist. Add **one** entry
to the `PUBLIC` map, in the voice of the entries already there:
```ts
'run-shares/[token]/route.ts:GET': 'the watcher has no account by design — the token is the credential',
```

Wrap every handler in `try/catch` returning `apiError(500,'internal',…)`, like the
neighbours. **Read `src/app/api/messages/requests/route.ts` first** — it's the
newest route and the pattern to copy.

### 2. Types

Append to **`src/lib/types.ts`** (with a short banner comment):
```ts
export interface RunShareSummary { id: string; token: string; expiresAt: string; sosAt: string | null }
export interface RunShareResponse { share: RunShareSummary | null; created?: boolean }
export interface RunShareBeaconResponse { active: number }
```
(`PublicRunShare` is already exported from `run-share.ts` — import it from there,
don't redefine it.)

### 3. Client helper — `src/lib/run-share-client.ts` (NEW)

A small module so the tracker doesn't grow another 150 lines of fetch plumbing.
Use `apiGet`/`apiSend` from `@/lib/api` (read that file for how errors surface):
```ts
export function watchUrl(token: string): string   // `${window.location.origin}/watch/${token}`
export async function createShare(): Promise<RunShareSummary>
export async function endShare(): Promise<void>
export async function sendBeacon(input: {
  lat: number; lng: number; accuracyM: number | null; distanceKm: number; durationSec: number; sos?: boolean
}): Promise<number>  // returns the `active` count
export async function shareLink(url: string): Promise<'shared' | 'copied' | 'failed'>
  // navigator.share if available (it's a Capacitor webview, usually is), else
  // navigator.clipboard.writeText, else 'failed'. A user CANCELLING the native
  // share sheet throws AbortError — that must return 'shared'/not 'failed', not throw.
```

### 4. Watch page (public) — 3 files

**`src/app/watch/[token]/page.tsx`** — server component:
- `export const metadata: Metadata = { title: 'Live run — Runsemble', robots: { index:false, follow:false, nocache:true } }`
- `{ params }: { params: Promise<{ token: string }> }`, await it.
- Render `<WatchClient token={token} />`. **No data fetching here** (must not be cached).

**`src/app/watch/[token]/watch-client.tsx`** — `'use client'`:
- Fetch `GET /api/run-shares/<token>` on mount, then every **10 s**, but **only
  while `document.visibilityState === 'visible'`** (a phone in a pocket must not poll).
  Clean up the interval on unmount and stop when hidden.
- Render every state properly: loading; unknown/404 ("This link is no longer
  active"); `live`; `stale` (show the map with the **last** position **and** a clear
  "last seen N minutes ago" banner — don't hide the map); `ended`; `expired`;
  `revoked`.
- **SOS state is loud**: red banner at top, the word SOS, the time it was raised,
  and a plain line telling the reader to call **112** / their local emergency
  number if they can't reach the runner. `role="alert"`. **No infinitely looping
  animation** (house rule — the design memo forbids them).
- Show: runner first name + avatar initial, distance, duration, a **ticking**
  "last update N seconds/minutes ago" (`aria-live="polite"`), and an explicit
  expiry line.
- **No login prompt, no app-install nag** — this person is not a growth funnel.
  A small neutral footer link back to `/` is fine.
- Type the payload as `PublicRunShare` from `@/lib/run-share`. Text legible at
  **11 px minimum**.

**`src/components/runsemble/watch-map.tsx`** — `'use client'`, default export:
- Mirror `src/components/runsemble/live-run-map.tsx`'s Leaflet / react-leaflet
  setup (CARTO voyager tiles, the same attribution, divIcon marker) but simpler:
  one marker at the runner's position + an accuracy circle when `accuracyM` is
  given, recentres when the position changes.
- Props: `{ lat: number; lng: number; accuracyM: number | null; stale: boolean }`.
  When `stale`, grey/desaturate the marker so "old fix" reads at a glance.
- Loaded from `watch-client.tsx` via `next/dynamic` with `{ ssr: false }` (Leaflet
  touches `window`).

### 5. Wire into the run tracker — `src/components/runsemble/run-tracker.tsx` (EDIT, ~1000 lines)

**Read the whole file first.** The GPS ingestion, native recorder and crash
recovery in it are load-bearing — **do not disturb them, don't reformat, keep the
diff tight.**
- New state: the active share (`RunShareSummary | null`) + a sharing-busy flag.
- A **"Share live"** control in the running/paused UI, styled exactly like the
  existing pause/finish buttons (read the JSX around them). Icon: `Share2` from
  `lucide-react`. On tap: `createShare()` → `shareLink(watchUrl(token))` → toast
  the outcome (uses `sonner`, already imported). Once a share exists, the control
  shows it's live and offers **"Stop sharing"** (`endShare`) + re-send.
- A **beacon effect**: while `phase === 'running'` AND a share is active AND there
  is a position, POST a beacon every `BEACON_INTERVAL_MS` (import from
  `@/lib/run-share`). If it returns `active === 0`, clear local share state and
  stop. **A beacon failure must never interrupt the run — catch and swallow.**
  ⚠️ **React Compiler lint**: don't call setState in a render-phase effect body.
  Follow the existing ref+interval pattern in this file (see the GPS effects).
  Watch for the **stale-closure trap** — an interval created once reads the first
  render's `distanceKm`/`pos` forever; read current values from refs.
- An **SOS control**, visible **only** while a share is active. It must take **two
  taps** (arm, then confirm) — a mis-tapped SOS a contact sees as a real alarm is
  its own harm. Confirmed → `sendBeacon({ …, sos:true })`, then show persistent
  in-run "SOS raised" state.
- **Honest copy** when a share is created, somewhere they'll actually read it (not
  a toast that vanishes): *they see your live position until you stop or the run
  ends; anyone with the link can see it; this is not an emergency service — call
  112 if you're in danger.*
- In **`handleSave`** (~line 559), **end the share** when the run is saved, done so
  a failure to end it can't block or fail the save.

---

## After building — verify (run these; all must pass)

```bash
npx tsc --noEmit
npx eslint . --max-warnings=0
npx vitest run
npx next build
```

The build must show `/api/run-shares`, `/api/run-shares/beacon`,
`/api/run-shares/[token]`, and `/watch/[token]` in the route manifest. Fix
anything red before committing — don't weaken a test to make it pass.

## The database migration (Arian runs this, not the AI)

The migration file exists but **has not been applied to production**. After the
code is merged, **Arian** runs:
```bash
npx prisma migrate deploy
```
It's purely additive (a new table) — no existing data is touched, and with no
rows in it the app behaves exactly as before, so it's safe to apply any time.

---

# The other two items from "H42, H26, H27"

- **H27 (message requests)** — ✅ **done and deployed** in commit `85fa2ec`. A
  stranger's first DM now knocks instead of landing on your lock screen. Its
  migration `20260723210000_message_requests` also still needs
  `npx prisma migrate deploy` if not already applied.
- **H26 (two-sided buddy consent)** — **left deliberately un-built, and this is a
  decision for Arian, not a coding task.** The dangerous half is already closed:
  you can only be tagged as a buddy by someone you actually ran with (co-presence
  is enforced in `src/lib/buddies.ts`), and either side can remove the link
  quietly via `DELETE /api/buddies`. What remains is making a buddy row require an
  explicit *Accept* tap. That adds friction to the exact "I just met someone on a
  run" moment the app exists for, to remove a now-small residual risk. If Arian
  wants it built anyway it's ~1 hour: a `status` on the `Buddy` row + an
  accept/decline endpoint + a pending-requests list. **Don't build it without him
  saying yes.**
