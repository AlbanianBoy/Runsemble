# Runsemble — Production Readiness Plan

Authoritative work list, verified against the actual code on 2026-07-16 (commit `018b8ae`).
Hand this document to any model/agent working on the repo. Items are ordered by priority
within each tier. Claims from external audits that turned out false or stale are listed at
the bottom so nobody re-fixes them.

## Non-negotiable constraints (read before touching anything)

1. **Hybrid architecture**: Next.js 16 (App Router) + Capacitor 8. The Android/iOS apps load
   runsemble.net via `server.url` — JS changes deploy through the web (user reopens the app);
   native changes (Java/Swift/Gradle/manifest) require a rebuild + reinstall.
2. **Pushing to `main` auto-deploys production** via Vercel. Never push without the founder's go.
3. **Strict React Compiler ESLint**: no `ref.current` reads during render, no sync `setState`
   in effect bodies. Run `npm run lint` before committing UI changes.
4. **Do NOT swap the GPS plugin** (`@capacitor-community/background-geolocation`, patched via
   patch-package). @capgo and Transistorsoft were evaluated and rejected. The patch file in
   `patches/` is load-bearing; after ANY edit under the plugin's `node_modules` dir, regenerate
   the patch (delete the plugin's `android/build` dir first).
5. `scripts/postinstall.mjs` skips patch-package on Vercel (`VERCEL` env var). Do not regress.
6. `.env` is gitignored and must stay that way. Prod `prisma db push`/migrate is founder-gated.
7. Package manager is **bun** (`bun.lock`). `package-lock.json` was deliberately removed.
8. GPS tracking is considered GOOD ENOUGH for launch (verified on-device 2026-07-16).
   Do not re-architect it. Remaining GPS polish items are in Tier 3.

## Tier 1 — Fix before public launch (prod-blockers)

**Status: items 1, 2, 3, 5, 6 are DONE (2026-07-16). Item 4 is founder-only and still open.**

1. ~~**Delete the `GET` handler from `src/app/api/seed/route.ts`.**~~ **DONE.** Route is
   POST-only; nothing referenced the GET.
2. ~~**Bound the conversation-list query in `src/app/api/messages/route.ts`.**~~ **DONE**, via
   the proper windowed SQL, not `take: 500`. `take: 500` was rejected deliberately: ordered
   newest-first it silently drops any partner whose last message falls outside the 500 newest,
   trading a perf bug for a correctness bug. Now `DISTINCT ON (partner)` picks each partner's
   newest message in the DB, an outer `ORDER BY createdAt DESC LIMIT 200` bounds by recency,
   and a separate `GROUP BY` returns unread tallies (`COUNT(*)::int` — the cast matters, raw
   `COUNT` returns bigint and breaks JSON serialisation). Verified against the live schema and
   proven byte-identical to the old JS folding for every user with DMs.
3. ~~**Remove 4 dead dependencies.**~~ **DONE.** Honest accounting: `next-auth` and
   `z-ai-web-dev-sdk` left the tree entirely (the real win). `effect` and `js-cookie` remain as
   *transitive* deps of `@prisma/config` and `@reactuses/core` respectively — dropping them as
   direct deps is still correct (nothing imported them), but they don't disappear. 8 packages
   removed; lint/tests/build all green.
4. **Founder-only chores (credentials — no agent can do these). STILL OPEN:**
   - Rotate the Resend API key (leaked into a chat context earlier).
   - Remove `admin@runsemble.dev` from `ADMIN_EMAILS` in Vercel env.
5. ~~**Add a minimal CI workflow.**~~ **DONE** — `.github/workflows/ci.yml`. Runs
   `bun install --frozen-lockfile`, lint, test, build on PR + push to main. Needs no secrets
   (a syntactically-valid dummy `DATABASE_URL` suffices; nothing connects at build time), so it
   works on forks. The install step also re-applies the background-geolocation patch, so a
   broken GPS patch now fails CI.
6. ~~**Move post images out of Postgres.**~~ **DONE, but dormant until you act.** The audit's
   claim that `User.avatar` holds base64 is **false** — there is no avatar upload path at all
   (avatars are initials via `AvatarFallback`). The only image ingress in the app is
   `POST /api/feed`. New `src/lib/image-store.ts` uploads to Vercel Blob and stores the URL
   **when `BLOB_READ_WRITE_TOKEN` is set**, and otherwise falls back to today's inline base64,
   so it ships safely with no behaviour change. Upload failure also degrades to inline rather
   than losing the post. Read path needed no change — `<img src>` renders both `data:` and
   `https:`, so old rows keep working.
   **→ FOUNDER ACTION: create a Blob store in the Vercel dashboard (Storage → Create → Blob,
   link it to the project). Vercel injects `BLOB_READ_WRITE_TOKEN` automatically; the next
   deploy starts storing URLs. Until then every posted photo still lands in Postgres.**

## Found while doing Tier 1 (not in either audit)

- **`GET /api/auth/export` was broken in production — FIXED.** The DB3 consolidation
  (`6f80909`) deleted the `GroupChatMessage` model but left `db.groupChatMessage.findMany()`
  in the GDPR data-export route. At runtime that property is `undefined`, so every export
  request threw `TypeError` and returned 500. Neither audit caught it because
  `next.config.ts` sets `typescript: { ignoreBuildErrors: true }` — the build never
  typechecks. Group messages are now `ChatMessage` rows with `groupId` set, so the DM/group
  split was restored exactly. The same stale reference also broke the (dev-only) seed route;
  fixed too.
- ~~**`typescript: { ignoreBuildErrors: true }` in `next.config.ts` is how that shipped.**~~
  **FIXED.** The flag is gone and the tree typechecks clean (0 errors, was 13). `npm run
  typecheck` exists and CI runs it ahead of the build. **Keep it at zero** — this flag is
  precisely why a route calling a deleted Prisma model reached production with a green build.
- ~~**`seed.ts` and `seed-db.ts` at the repo root are dead code.**~~ **DELETED** (754 lines).
  Referenced nowhere, and both still called `db.groupChatMessage`, so they were broken as well
  as dead. They held 9 of the 10 remaining type errors.
- **The leaderboard's non-xp boards were unindexed.** Neither audit spotted it; one asserted
  the opposite ("rebuilt from a full table scan on every request" — false for `xp`, which was
  indexed). `User` had *only* `@@index([xp])` while the board sorts by five metrics. Indexes
  for the other four are in the item 9 migration.

## Tier 2 — Hardening

**Status: 7, 9, 10, 11, 13, 14 DONE (2026-07-16). 12 rejected as unsafe — see below.
8 is blocked on the founder. Two migrations are written but NOT APPLIED.**

> **→ FOUNDER ACTION: run `prisma migrate deploy` when ready.** Two migrations wait:
> `20260716120000_drop_stale_counters_add_indexes_xor` and `20260716130000_enum_closed_value_sets`.
> Nothing auto-applies them (`npm run build` only runs `prisma generate`). **Deploy the code
> first, then migrate** — Prisma stops selecting the dropped columns, so the app runs fine
> while they still exist, but the old code breaks the moment they're gone. The enum migration
> is order-independent.

7. ~~**Admin defense-in-depth.**~~ **DONE, but not as specified.** Investigated and
   deliberately did *not* DB-validate sessions in `middleware.ts`. Middleware runs on the
   **edge runtime, which cannot reach Prisma** — validating there means switching the runtime
   on the critical path of every `/admin` and `/api/seed` request. The gain is zero: the entire
   admin surface is one read-only server-rendered page which already resolves the session
   against the DB and checks `ADMIN_EMAILS` *before touching any data*, and there are no
   `/api/admin/*` routes or server actions. Risk for no benefit. The real hazard was the
   **comment**, which claimed middleware "enforces session auth" — inviting someone to add an
   admin API route behind a gate that only checks a cookie *exists* and whose matcher wouldn't
   even cover it. Comment fixed to state the actual boundary.
8. **Rate limiting to a shared store. BLOCKED ON FOUNDER — needs an account.**
   `src/lib/rate-limit.ts` is in-memory per serverless instance (self-documented as
   pilot-grade). Provision Upstash Redis or Vercel KV (dashboard → Storage), then the swap is
   mechanical: keep the `rateLimit(key, limit, windowMs)` signature so no call site changes,
   and make it async. Not urgent at pilot scale — it still blunts a single client hammering
   login.
9. ~~**Drop stale counter columns.**~~ **DONE.** Correction to the audit: `FeedPost.likes` was
   **not** "stale dead weight" — the like route kept it in step *atomically in a transaction*,
   which is why measured drift was 0. It was redundant, not stale. Dropping it required
   refactoring the like route (it returned `updatedPost.likes` to the client) to count the
   `PostLike` rows instead; the comment route already recomputed relationally. `RunGroup.
   totalKmThisWeek` was genuinely dead. Counts are now derived, so drift is impossible rather
   than merely avoided.
10. ~~**Enum-ify free-string columns.**~~ **DONE**, plus the half the audit missed. The audit
    listed the columns without their models — `role` is on `GroupMember` (not `User`), `status`
    on `HotspotParticipant` *and* `RunInvite`, `sportType` on `Hotspot` *and* `RunSession`.
    Also: `sportType` ∈ {running, **trail, walking**}, not just `running`; and the `paceLevel`
    schema comment listing `any` was wrong — `any` belongs to `paceRange`, a different field.
    Enums *alone* would have converted "stores garbage" into a **500**, so `src/lib/enums.ts`
    validates the same sets at the four request-body ingress points and returns 400.
    `enums.test.ts` asserts the mirror matches Prisma's generated enums so they can't drift.
    `preferredSport` deliberately left String — no UI selector, unclear value set.
11. ~~**ChatMessage XOR constraint.**~~ **DONE.** Verified 0 existing rows violate it first.
    Note in the schema: Prisma can't express CHECK, so **`db push` will not recreate it** —
    use `migrate deploy`/`migrate dev` or the guarantee is silently lost.
12. **Cache read-heavy routes — REJECTED, the advice is unsafe here. Do not implement it.**
    `s-maxage` targets *shared* (CDN) caches, and **both routes are per-viewer**:
    `/api/leaderboard` always shows you yourself even when `privacyVisible` is false, and
    `/api/users` filters by *the viewer's* blocks. A CDN would serve one user's personalised
    response to another — exposing hidden users (the exact guarantee that code protects) and
    leaking block relationships. `Vary: Cookie` would make it correct and useless (unique
    session cookie per user → no hits). The audit's premise was also wrong: the leaderboard is
    **not** "a full table scan on every request" for the default board — `xp` was indexed. It
    *was* a full scan for the other four metrics, which had no index at all. **Fixed the real
    cost with indexes** (item 9's migration) instead. If CDN caching is ever wanted, split a
    genuinely public board (`privacyVisible: true` only) from the viewer's own rank.
13. ~~**Root `README.md`.**~~ **DONE.**
14. ~~**`package.json` name.**~~ **DONE** — `runsemble`. Also synced the stale name in `bun.lock`.

## Tier 3 — Scale & polish (post-launch, prioritize by user feedback)

15. **Cursor pagination** for `/api/feed` (currently newest-100) and `/api/users`
    (currently take-500-with-includes; fine for one city, breaks at multi-city).
15b. **Private-group photos rely on an unguessable URL, not on authorisation.**
    Post photos are stored with `access: 'public'` (decided 2026-07-16: ship public now,
    revisit when private groups get real usage). The URL only reaches viewers who pass
    `canViewPost`, but a Vercel Blob public URL **never expires** — so a private-group photo
    URL, once leaked (shared, logged, sitting in browser history), works for anyone forever.
    This is the same model Instagram/WhatsApp/Discord use, and fine at pilot scale; it is a
    real gap if private groups become the point of the product.
    **Fix when needed:** `@vercel/blob` (v2.6.1+) supports `access: 'private'` + `get()`.
    Store the blob *pathname* rather than the URL, add `GET /api/feed/[id]/image` that checks
    the session and `canViewPost(post.groupId, userId)` before streaming, and point the feed's
    `<img src>` at it. **Do not copy Vercel's example header** (`Cache-Control: private,
    no-cache`) — that re-downloads every photo on every scroll, which is a function
    invocation and full bandwidth each time, brutal on mobile data. Blob paths are immutable
    UUIDs, so `private, max-age=86400, immutable` is safe and keeps it to one function hit per
    image per device. Rows written before the switch (`data:` or a public URL) must keep
    rendering.
16. **GPS quality polish** (tracking works; these are refinements):
    - Light smoothing (median-of-3 or simple Kalman on lat/lng) before distance accumulation.
    - Reconsider 3:1 path thinning at save (hurts curve fidelity); thin adaptively by
      heading-change instead.
    - Store per-point `acc` and provider in the saved path for later reprocessing.
    - Per-km split times for backgrounded segments are approximate (recorded at drain time).
17. **Move XP/badge/streak computation out of the `POST /api/runs` request path** (background
    job or at least `after()`), so run saves stay fast.
18. **Real-time layer**: chat/lobby currently poll. At 10x users move to SSE or a hosted
    websocket (the `examples/websocket/` server is a prototype, not deployed).
19. **API integration tests** (login, run POST, feed, messages) — unit coverage of the pure
    logic is already decent (9 test files); the API layer has zero.
20. **GpsPoint table or PostGIS** if geospatial features ("runs near me") get prioritized.

## Audit claims that are FALSE or STALE — do not "fix" these

- "No `.env.example`" — false; it exists at repo root.
- "`prisma db push` only, no migration history" — stale; `prisma/migrations/` has real
  migrations (init, remove_group_chat_message, add_fcm_token).
- "No index on ChatMessage in the DM-read direction" — false; `@@index([senderId, recipientId])`
  and `@@index([groupId])` both exist.
- "Admin gate only checks cookie presence" as CRITICAL — misleading; the page itself does a
  full server-side session + admin-email check. Middleware hardening is Tier 2, not critical.
- "`/api/users` unbounded" — it is bounded (`take: 500`) with a documented rationale.
- "ErrorBoundary shows raw stack traces" — fixed in `e252a6a`.
- The debug FCM key-inspector endpoint — already removed (`c9e21e4`).

## Current known-good state (for context)

- GPS: fused-primary + raw-GPS starvation fallback in the patched community plugin;
  Phase 2 native disk-first RunRecorder (Android shipped + on-device verified; iOS twin in
  code, untested until TestFlight). Samsung "Never sleeping apps" is the required device
  setting — the Phase 3 first-run guide must walk Samsung users through it.
- Push: FCM V1 with service-account JWT; token registered on app open; DM pushes deep-link
  to the Groups tab DM sheet.
- Auth: custom httpOnly cookie sessions backed by a DB table (deliberate; do not add next-auth).
- Offline: run uploads queue in localStorage, idempotent by `clientRunId` (unique in DB).
