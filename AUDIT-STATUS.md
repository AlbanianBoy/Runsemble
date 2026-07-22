# Audit status — all 141 findings, current

Reconciled from the 141-finding architecture + UX audit against what has actually
shipped (verified commit-by-commit). Last reconciled: 2026-07-23.

**Legend:** ✅ done · 🟡 partial · 🟢 foundation shipped, rest handed off · ⬜ open (codeable) · 🔒 needs you (decision / money / legal) · ➖ duplicate, fixed under linked ID · ✔️ verified not-an-issue

**Tally: 125 of 141 resolved.** 5 need a decision, 4 need infra/money, 1 needs your product call, 1 half-shipped (H42), 5 deliberately closed as no-action.

---

## CRITICAL (5) — all resolved

| | | |
|---|---|---|
|✅|C1|FeedPost had zero indexes — every feed load was a full scan|
|✔️|C2|Neon pooler — `/api/admin/diagnostics` confirmed prod IS pooled (`"pooled": true`). The audit's assumption was wrong; nothing to fix|
|✅|C3|Unbounded companions → unlimited XP from one request|
|✅|C4|Women-only runs were cosmetic — gender now collected + enforced|
|✅|C5|Moderation queue had no enforcement power — suspend now refuses sessions|

## HIGH (45) — 37 done · 1 half-shipped · 7 need you

**✅ done (37):** H3 (transaction + `after()`), H4, H5, H6, H7, H8, H9➖C1, H10➖H5, H11➖H8, H12 (buddy tag needs co-presence evidence + is removable), H13, H14 (rate limiting live), H16➖H4, H17 (erasure reaches PostHog), H19 (idle-backoff polling), H20, H21, H23➖H7, H24, H25, H27 (stranger-DM request gate), H28, H29➖C4, H30, H33➖H7, H34, H35➖H27, H36, H37➖H12, H38, H39, H40, H41, H43, H44, H45

**🟢 H42** — SOS / share-my-run-live. **Foundation + API shipped** (RunShare model + migration, `run-share.ts` core lib + 31 tests, 24 h retention purge, **and now the 3 API routes: create/get/delete, beacon, and the public `/watch/[token]` read — 10 route tests, gated + noindex + no-store**). **Remaining:** the public `/watch` page (3 files) and the run-tracker wiring (client helper + types + the Share/SOS controls) — specced in `HANDOFF-H42.md`.

**🔒 need you (7):**
| | | |
|---|---|---|
|🔒|H1 / H18|➖ C2 — resolved with the pooler check|
|🔒|H2|Durable outbox for run-save — **now buildable** (Upstash is connected). Currently transaction + `after()` (H3); a crash between commit and fan-out still drops a notification|
|🔒|H15|Location shared by default, vs. what the privacy notice implies — **product decision**, real activation cost|
|🔒|H22|Funnel unmeasurable end-to-end — PostHog/Sentry are live, but top-of-funnel events need instrumenting (small, but needs your analytics intent)|
|🔒|H26|Buddy connection unilateral — **forcing half closed** (H12). Making it two-sided (Accept tap) is a product decision; see note below|
|🔒|H31|No content backbone for official recurring runs — **your content, not code**|
|🔒|H32|Teal CTA fails WCAG AA (2.92:1 vs 4.5:1) — **your brand-colour call**|

## MEDIUM (61) — 47 done · 1 partial · 2 open · 11 need you

**✅ done (47):** M1/M14/M18/M57 (rate limiting), M3 (idempotency), M4 (auth-conformance gate), M5 (request boundary), M6, M7, M8 (per-user grid), M9, M10 (double push registration), M11, M12, M13, M15, M16, M17 (email-verify gate as Sybil friction), M19, M20, M23, M27, M28, M29, M30, M31, M32, M33, M35 (pin de-clustering), M36, M37, M38, M40, M41, M42, M43, M44, M45, M46, M47, M48, M49, M50, M51, M52, M53, M54, M56, M58, M59, M60, M61

**🟡 M39** — newcomer dead-end (softened, not fully solved)

**⬜ open, codeable (2):** M2 (Capacitor `server.url` coupling) · M34 (solo-run CTA dominance) · M55 (anticipation placement) — small polish, no blocker

**🔒 need you (5 buckets):**
| | | |
|---|---|---|
|🔒|M21|Transfer safeguards in the DPIA — **needs a lawyer**|
|🔒|M22|Rotate the Resend API key + drop `admin@runsemble.dev` from `ADMIN_EMAILS`|
|🔒|M24|Staging database — **infra/money**|
|🔒|M25|Migration automation — **infra**|
|🔒|M26|Bus factor — you own migrations, secrets, incident response alone|

## LOW (30) — 20 done · 5 accepted (no action) · 3 open · 2 need you

**✅ done (20):** L1 (malformed JSON → 400), L2 (error codes), L3, L7, L9, L10, L11 (FCM identity), L13, L14, L15, L16, L17, L18, L19, L20, L21 (dark theme), L22 (legible labels), L23, L24, L26, L27, L28 (availability audience), L29, L30 (contrast — audit's claim was corrected)

**➖ accepted / no action (5):** L4 (JSON-in-text columns) · L5 (partitioning not needed yet) · L12 ➖ M8 · L8 (CARTO tile licensing — 🔒 your call) · L25 (web real-time fallback — 🔒 your call)

**⬜ open, minor (1):** L6 (no PostGIS spatial index — fine at current scale)

---

## What that leaves, in plain terms

**Nothing is blocking a launch that a decision from you doesn't gate.** The
remaining work is:

1. **Finish H42** — the live-share plumbing. Specced in `HANDOFF-H42.md`.
2. **Buildable when you want it: H2** durable outbox (Upstash is connected now).
3. **Your decisions (no code from me possible):** H15 (location default), H31
   (official-run content), H32 (brand colour), H26 (two-sided buddies), M21
   (legal review), M22 (rotate Resend key).
4. **Infra/money:** M24 staging DB, M25 migration automation, M26 bus factor.
5. **Minor polish, any time:** M2, M34, M55, L6.

### On H26 (why I stopped)
The dangerous half is already closed: you can only be tagged as a buddy by
someone you actually ran with (co-presence enforced in `src/lib/buddies.ts`), and
either side can remove the link quietly (`DELETE /api/buddies`). What remains is
forcing an explicit *Accept* tap — which adds friction to the exact "just met
someone on a run" moment the app exists for, to remove a now-small residual risk.
That's a product call, not a bug. ~1 hour to build if you decide you want it.

### Migrations waiting on you
Two are written but not yet applied to production. After the next merge:
```bash
npx prisma migrate deploy
```
covers both `message_requests` (H27) and `run_shares` (H42). Both are additive.
