# Runsemble — launch-readiness & social-upgrade plan

Execution checklist for the next working session(s). Work top to bottom unless a
step says it's blocked on the founder (phone tests, Play Console, env changes).
Written 2026-07-09, after: offline steps 1–3 shipped and field-verified, the
6-finding security sweep, GPS accuracy gate, background-permission nudge, and
Play submission prep (runbook + assets).

## Progress log

**2026-07-10 — Part A (mostly) + Part B (security) DONE, verified live.**
- Device matrix (A4): founder confirmed on real Android — background walk test
  (continuous route, accurate distance/time, notification), crash recovery,
  offline sync, no stationary drift, ±8m outdoors. **Part C tracking fixes are
  therefore NOT needed** (timer holds, accuracy gate right, no jump-filter loss).
  Cold-launch recovery bug found + fixed (page reopens the tracker).
- A2: `npm run probe` (`scripts/security-probe.mjs`) — 18-check regression suite,
  green against prod.
- B1: private-group posts/comments/likes no longer leak; private groups
  invite-only (self-join blocked). B2: private groups hidden from the list;
  account-delete cascade audited clean; export completed. B3: input length caps.
  B4: auth rate limiting. B5: feed/users query bounds.
- Also shipped from founder feedback: chat double-send guard, add-people-to-group
  (invite), background-permission nudge, GPS accuracy gate + native/web chip.

**Part D progress:**
- D1 (run invites) — DONE: API + UI (invite button on runner profile, received
  card on the map), block-aware, notified, probe-covered (22/22).
- D3 (like/comment notifications) — already wired in the like/comment routes
  (verified). Optional extra: notify other thread commenters, not just author.
- D5 (invite-a-friend) — DONE: native share button on the profile.
- D4 (find people) — PARTIAL: pace + radius filters already exist on the map.
  Still to do: name search endpoint + suggested-runners.
- iPhone decision: founder leaning native; RECOMMENDED Capacitor iOS instead of
  a Swift rewrite (same background GPS, reuses 100% of the code).

**Still open:** A5 (iPhone check / Capacitor iOS target), D2 (group admin: edit/
delete/remove/promote/join-requests — "add people" already shipped), D4 (search +
suggestions), D6 (reminders), D7 (chat polish), "present people on map" (live
location, needs privacy design), Part E (push + store), Part F backlog. Also
outstanding on founder: rotate the Resend key + drop admin@runsemble.dev (A6).

---

## Executor notes (read first)

- **Stack constraints:** strict React Compiler ESLint (no `ref.current` reads in
  render → lazy `useState`; no sync setState in effect bodies). Schema changes go
  through `prisma db push` (NEVER `migrate`), and destructive pushes need the
  founder to run them. `.env` is gitignored — never commit secrets.
- **Push = deploy.** `main` auto-deploys to prod (runsemble.net) and the Android
  app loads that site live. Code fixes reach the phone with no rebuild. Verify
  (tsc + eslint + vitest + behavioral probe) BEFORE pushing anything on a live path.
- **Probes:** when testing against the DB, create throwaway rows (`probe_*`
  emails), verify, and delete them in the same script. Never seed fake users
  into prod permanently.
- **Every fix ships with proof.** The pattern that worked: static checks → local
  behavioral probe (curl/node against `next dev`) → deploy → one live smoke check.
- Sizes: S = <1h, M = 1–3h, L = a session.

---

## Part A — Verify everything shipped so far

### A1. Automated baseline (S)
Run and confirm green: `npx tsc --noEmit`, `npm run lint` (0 errors outside
`android/`), `npm test` (54+), `npm run build` (production build compiles).

### A2. Turn the ad-hoc security probes into a repeatable script (M)
This session's authz/idempotency probes were throwaway. Recreate them as
`scripts/security-probe.mjs` (run against `next dev` + the dev DB), covering:
- run-save idempotency: same `clientRunId` POSTed twice → one row, `duplicate: true`
- group chat GET: outsider 403 / member 200
- private group detail + lobby: outsider 403 / member 200
- feed POST into a group: non-member 403 / member 201
- user PATCH with `xp`/`totalRuns` → ignored
- leaderboard: `privacyVisible=false` absent for others, visible to self
- self-cleaning (deletes all probe rows), exits non-zero on any failure.
Add `npm run probe`. This becomes the regression suite for every future API change.

### A3. Live prod smoke (S)
`vercel ls` newest = Ready; `GET /api/runs` unauth → 401; `GET /api/groups/x/chat`
unauth → 401; site loads; SW registered in prod.

### A4. Device verification matrix (founder, guided)
Walk through with the founder on his Android phone, one at a time:
1. **Walk test (gates Part C1/C2):** start run → lock screen → walk 2–3 min
   outside → reopen. Record: route continuous or gapped? distance plausible?
   **timer shows ~walk duration or much less?**
2. Offline finish re-test: airplane mode → finish → save ("saved on your phone"
   toast) → airplane off → *foreground the app only* (don't kill it) → verify the
   new foreground-drain uploads it (this was the fix in 04a3ff8).
3. Permission nudge: appears once on run-ready screen (native only), "Open
   settings" deep-links, dismiss persists across restarts.
4. Sitting-still drift: distance stays ~0.00 for 2+ min.
5. Kill mid-run → reopen within 2 min → auto-resumes running with data intact.

### A5. iPhone/PWA check (M — founder's audience skews iPhone!)
The iPhone story is currently the PWA. On any available iPhone: Safari →
runsemble.net → Add to Home Screen. Verify: standalone display, safe areas, SW
offline shell opens, run tracking works foreground (note honestly: iOS PWA has
NO background GPS — screen must stay on; consider an in-app note for iOS users).

### A6. Data & secrets hygiene (S, partly founder)
- Query prod for leftover `probe_*` / `%@runsemble.test` users → delete any.
- Founder: rotate the Resend API key (two keys appeared in chat) and update
  Vercel env + redeploy.
- Founder: remove `admin@runsemble.dev` from `ADMIN_EMAILS` env if still present.
- Confirm `.env` never committed (`git log --all -- .env` empty) and `*.jks`
  ignore is in place (done).

---

## Part B — Finish the security/robustness audit

The 6-finding sweep covered the routes returning user data + main writes. These
were **never read** this session — audit each for: session identity, ownership/
membership checks, private-group leakage, PII in selects, input length caps.

### B1. Suspected real bugs — check these first
1. **Global feed leaking private-group posts (likely HIGH).** `GET /api/feed`
   `scope=all` filters only blocks. Posts created with a private `groupId`
   probably appear in everyone's global feed even though the group page itself
   is now members-only. Fix direction: global feed returns only `groupId: null`
   posts + posts from public groups; group-scoped posts visible to members
   (mirror the `scope=following` membership logic). Verify with a probe.
2. **Comments/likes on private-group posts.** `GET/POST /api/feed/[id]/comments`
   and `POST /api/feed/[id]/like` — if the post belongs to a private group,
   non-members can likely read the comment thread and interact. Same fix pattern.
3. **Joining private groups.** Read `POST /api/groups/[id]/join`. If it allows
   joining private groups → bug (fix: 403). If it blocks → private groups are
   currently dead ends (no invite path) → feeds Part C3.

### B2. Unaudited routes (M total)
`challenges/` (both), `feed/[id]/comments`, `feed/[id]/like`, `groups/route.ts`
(list+create), `groups/[id]/join`, `hotspots/route.ts` (list+create),
`hotspots/[id]/join`, `runs` GET (re-check `path` privacy), `badges` (decide:
public gamification data — probably fine, but conscious decision), `buddies`,
`auth/export` (does it include ALL models a user owns — runs, posts, comments,
likes, messages, blocks?), `auth/account` DELETE (do cascades cover PostLike,
comments, RunRating, Block, Session, VerificationToken?), `auth/signup|login`
(see B3), `users/[id]/block` (done ✓).

### B3. Input caps & auth hardening (M)
- Length caps where missing: feed post `content`, comments, DM `content`, group
  chat `content`, bio/name in profile PATCH (e.g. 2k chars posts, 1k messages,
  300 bio, 60 name). Prevents multi-MB junk rows.
- Login brute-force: verification tokens already have attempt caps; login has
  none. Pilot-grade fix: small per-identifier attempt window (see B4 caveat).
- Signup: normalize email (trim/lowercase) if not already; enforce password
  minimum server-side.

### B4. Pilot-grade rate limiting (M, with an honest caveat)
Vercel functions are stateless → in-memory limits are per-instance best-effort
only. That's still worth having at pilot scale (blunts naive abuse): tiny
token-bucket helper keyed by IP+route for `signup`, `login`, `forgot-password`,
`messages POST`, `feed POST`, `comments POST`. Document the limitation; a real
store (Upstash/Vercel KV) is a Phase-E upgrade. Don't over-engineer.

### B5. Pagination before it hurts (S–M)
`GET /api/feed` and `GET /api/users` return EVERYTHING (users even includes all
badges + memberships). Fine at 11 users, quadratic pain later, and trivially
cheap now: `take: 50` + `cursor` on feed; slim the users-list payload (drop
badges/memberships from the list view — profile fetches them). Check the client
still renders.

---

## Part C — Tracking correctness (gated on A4 walk test)

### C1. Wall-clock timer (M) — do this if A4.1 shows time undercounting
`elapsedSec` advances via a 1s `setInterval`; Android throttles/suspends WebView
timers with the screen off, so a pocketed run may log 20s for 3 min. Rewrite:
derive elapsed from timestamps — `elapsedSec = accumulatedBefore + (now -
lastResumeAt)/1000` computed on each tick AND on visibilitychange/position
ingest; pauses adjust `accumulatedBefore`. Keep persistence fields compatible
(startedAt already stored). Acceptance: 3-min screen-off walk shows ~3 min.
NOTE: splits use `elapsedRef` — verify split math still correct after rewrite.

### C2. Accuracy gate tuning (S) — use A4 numbers
If outdoor accuracy sits at 5–15m, keep 25m. If the founder's phone reports
20–30m outdoors routinely, raise gate to ~35m and rely on the jitter floor.
Data-driven, one constant.

### C3. Distance-while-suspended honesty check (investigate, S)
With screen off, the native watcher keeps delivering positions to the JS layer
only if the WebView runs. If A4.1 shows a *gapped route but correct native
plugin behavior*, the fix direction is the plugin's buffered locations or
accepting >60m jumps when `t` gap is large (currently >60m jumps are DISCARDED —
which silently deletes real distance after a suspension!). Revisit the
`d < 0.06` cap: scale it by time gap between samples (e.g. allow up to
`gapSeconds * 6 m/s`). Small change, big correctness win for real runs.

---

## Part D — Social upgrades (the core ask)

Ordered by impact-per-effort for an 11-user Antwerp pilot. The philosophy that
already exists in the code and should stay: **you connect by running together,
not by friending.** Build everything to funnel toward a shared run.

### D1. Activate run invites — the "add people" mechanic (L)
The `RunInvite` model exists (sender, recipient, message, status) with seeded
data and relations, but **no API route and no UI** — it's dormant. This is the
single most on-brand social feature: instead of a friend request, you invite
someone to run.
- API: `POST /api/invites` (recipientId, message, optional hotspotId), `GET`
  (mine, both directions), `PATCH /api/invites/[id]` accept/decline. Session
  identity, block-aware (reuse the messages block check), notify() on send and
  on accept. Cap open invites per sender-recipient pair (1 pending).
- UI: "Invite to run" button on runner profiles (map sheet + buddies list);
  invites inbox (notifications tab or its own small section); accept → opens a
  DM thread with the sender (message-first coordination) or links the hotspot.
- Acceptance: probe covers send/accept/decline/block-rejection; UI flows work
  in preview.

### D2. Fix the private-group dead end + admin tools (L)
Depends on B1.3 finding. Groups currently have GET-only detail — **no edit, no
delete, no member management, and (likely) no way into a private group.**
- Join requests: `POST /api/groups/[id]/join` on a private group creates a
  `pending` membership (add `status` to GroupMember via `db push`, default
  `active`); owner/admin notified; `PATCH /api/groups/[id]/members/[userId]`
  approve/reject/remove/promote (role-checked: owner>admin>member).
- Group admin: `PATCH /api/groups/[id]` (name/description/isPublic — owner or
  admin), `DELETE` (owner only). Mirror the write-side role checks on every read
  the sweep taught us about.
- UI: "Request to join" state on private groups; a minimal members-management
  sheet for owners/admins (approve requests, remove, promote).
- Update the security probe script with outsider/member/admin/owner cases.

### D3. Close the engagement loop: like/comment notifications (S–M)
Check whether `POST /api/feed/[id]/like` and comments POST call `notify()` for
the post author (and thread participants for comments). If missing, add:
"X liked your run 🎉", "X commented: …". This is the cheapest retention feature
that exists — every social app runs on it. Self-actions don't notify. Batch
naive-ness is fine at pilot scale.

### D4. Finding people: filters, search, suggestions (M–L)
Data already exists (`paceLevel`, `schedulePreference`, fuzzed coords, city):
- **Filters** on the people/map view: pace level + schedule chips (client-side
  against the users list is fine at this scale).
- **Search**: `GET /api/users/search?q=` (name contains, take 20, public
  projection, block-aware) + a search box on the people view.
- **Suggested runners**: on profile/map empty states, show 3–5 users with same
  paceLevel and overlapping schedulePreference, excluding buddies/blocked, with
  the D1 "Invite to run" CTA. One query, no ML pretensions.

### D5. Cold-start: official content + invite-a-friend (M — pilot-critical)
With 11 users the app must not feel empty:
- Script (run once against prod, founder-approved): create 3–4 **official**
  recurring hotspots at real Antwerp spots (Stadspark loop, Scheldekaaien, Het
  Steen — real coords exist in the dev seed) owned by the founder's account,
  `isOfficial: true`. NO fake users, ever (established constraint).
- "Invite a friend" button (profile + empty states): Web Share API sharing
  runsemble.net with a short pitch; falls back to clipboard copy.

### D6. Hotspot reminders — with an honest platform caveat (M)
"Run starts in 30 min" notifications need a scheduler. **Vercel Hobby crons are
limited (daily granularity)** — useless for 30-min-before. Pilot-grade
alternative: lazy trigger — when any client hits `GET /api/hotspots` (happens
constantly), a cheap check creates due reminder notifications for participants
of hotspots starting within 60 min (dedupe via notification type+entityId).
Ugly but honest and free; replace with real push (Part E1) later.

### D7. Chat polish (S–M, pick cheap ones)
- Group chat: `take: 50` exists but no pagination — add "load earlier" cursor.
- Unread badges: DM `totalUnread` already computed — surface it on the nav icon
  if not already; group unread needs `GroupMember.lastReadAt` (schema add) —
  only do if cheap in the client.
- DM privacy toggle ("everyone" vs "people I've run with / share a group with")
  — build only if founder wants it pre-pilot; default everyone at this density.

---

## Part E — Native & store track (parallel; mostly founder-gated)

### E1. Push notifications — the biggest social unlock (L, native rebuild)
Without push, DMs/invites/likes only surface when the app is open. FCM via
`@capacitor/push-notifications` + `google-services.json` + a `pushToken` field
on User + server-side FCM send inside `notify()` (fire-and-forget). Requires a
new native build → **bundle it with the Play submission build** so one review
covers both. Web push for PWA/iOS is a separate later track.

### E2. Play submission (founder, runbook exists)
`docs/play-store-release-runbook.md`: signed `.aab` (keystore backup!), internal
testing, screenshots (4–6), listing paste-in, background-location declaration +
demo video. Then the 14-day/20-tester closed test = the Antwerp pilot.

### E3. Terms page (S)
`/terms` 404s. Optional for Play but referenced by convention — generate a
simple honest terms page to match the existing privacy page.

---

## Part F — Deliberate backlog (do NOT do yet — chosen, not forgotten)
- Images → Vercel Blob storage (currently data-URLs in Postgres, capped 700KB).
- Real rate limiting via Upstash/KV.
- Dutch i18n (post-pilot; pilot audience is fine in English).
- Streak semantics: daily streaks punish rest days — consider "X runs/week goal"
  instead. Product decision with the founder, not a quick fix.
- Challenges feature completion (audit first in B2 — scope unknown).
- iOS native app (post-pilot, post-revenue).
- Map tile prefetch for offline maps (ToS-sensitive with free CARTO tiles).

---

## Suggested execution order
1. A1–A3 (baseline + probe script) — half a session, establishes the safety net.
2. B1 suspects (feed leak first) + B2 audit + B3 caps — fix as found, probe each.
3. A4/A5 device matrix with founder → C1–C3 tracking fixes as data dictates.
4. D3 (cheap loop) → D1 (invites) → D2 (groups) → D4/D5 → D6/D7.
5. E-track whenever the founder has Android Studio time; bundle E1 with it.
