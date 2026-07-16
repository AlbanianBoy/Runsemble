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
- **`typescript: { ignoreBuildErrors: true }` in `next.config.ts` is how that shipped.**
  `npm run build` passing proves nothing about types. Run `npx tsc --noEmit` separately.
  Currently 10 errors remain (was 13): 9 in the dead root seeders below, 1 cosmetic in
  `run-tracker.tsx:372` (`p.acc` is `number|null|undefined` vs a `number|null` param —
  harmless, because `ingestPosition` guards with `accuracy != null`, and loose `!= null`
  catches `undefined` too). **Once the seeders are gone, add `tsc --noEmit` to CI and
  consider removing `ignoreBuildErrors`.**
- **`seed.ts` and `seed-db.ts` at the repo root are dead code.** Referenced nowhere (not in
  `package.json`, `codemagic.yaml`, or `scripts/`); the live seeder is
  `src/app/api/seed/route.ts`. They carry 9 of the 10 remaining type errors. Recommend
  deleting them — deliberately left alone here to keep the Tier 1 commit focused.

## Tier 2 — Hardening (first weeks after launch)

7. **Admin defense-in-depth**: `/admin` page already does a real server-side
   `getSessionUser()` + `ADMIN_EMAILS` check (this is why the audit's "critical" was
   overblown). Still worth: validate the session token against the DB in `middleware.ts`
   instead of checking cookie presence only, so unauthenticated requests never reach the page.
8. **Rate limiting to a shared store.** `src/lib/rate-limit.ts` is in-memory per serverless
   instance (self-documented as pilot-grade). Move to Upstash Redis / Vercel KV. Keep the
   same `rateLimit(key, limit, windowMs)` signature so call sites don't change.
9. **Drop stale counter columns**: `FeedPost.likes` and `FeedPost.comments` (relational
   `PostLike`/`PostComment` + `_count` are the source of truth). Also drop
   `RunGroup.totalKmThisWeek` (legacy, computed from RunSessions now). Prisma migration +
   remove the seed writes.
10. **Enum-ify free-string columns**: `paceLevel`, `schedulePreference`, `sportType`,
    `postType`, `status`, `role` → Prisma `enum`s. One migration; also gives type-safety in TS.
11. **ChatMessage XOR constraint**: exactly one of `recipientId`/`groupId` must be set.
    Prisma can't express CHECK constraints natively — add it in a migration's raw SQL:
    `ALTER TABLE "ChatMessage" ADD CONSTRAINT dm_xor_group CHECK ((("recipientId" IS NULL) <> ("groupId" IS NULL)));`
12. **Cache read-heavy routes**: `Cache-Control: s-maxage=60, stale-while-revalidate=300` on
    `/api/leaderboard`; s-maxage=30 on `/api/users`. One line each.
13. **Root `README.md`**: stack, local setup (bun install → prisma generate → dev), env vars
    (point at `.env.example`, which EXISTS), how native builds work (Android Studio /
    Codemagic), deploy model (push-to-main = prod).
14. **`package.json` name**: `nextjs_tailwind_shadcn_ts` → `runsemble`.

## Tier 3 — Scale & polish (post-launch, prioritize by user feedback)

15. **Cursor pagination** for `/api/feed` (currently newest-100) and `/api/users`
    (currently take-500-with-includes; fine for one city, breaks at multi-city).
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
