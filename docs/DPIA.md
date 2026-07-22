# Data Protection Impact Assessment — Runsemble

**Status:** DRAFT for review · **Version:** 0.1 · **Prepared:** 2026-07-20
**Processing assessed:** The Runsemble mobile/web application — a location-based social running app that shows nearby available runners to one another and helps strangers arrange to run together in person.

> **Read this first.** This draft was prepared to give you a real, specific starting point grounded in what the application actually does today — not a generic template. It is **not legal advice**, and it is not a substitute for review by a qualified data-protection lawyer or DPO. A DPIA is a live accountability document: it must be signed off by the controller, revisited when the processing changes, and — because this processing is high-risk — you may be required to **consult the Belgian Data Protection Authority (Gegevensbeschermingsautoriteit / APD) under Article 36** before launch if residual risk stays high. Everything marked **[TO COMPLETE]** is a fact only you or your lawyer can supply; do not launch with those blank.

---

## 0. Document control

| Field | Value |
|---|---|
| Controller (legal entity) | **[TO COMPLETE — e.g. registered company name, or "Arian Behrami, sole trader"]** |
| Registered address | **[TO COMPLETE]** |
| Belgian enterprise/VAT number | **[TO COMPLETE, if registered]** |
| Controller contact | Arian Behrami — arianbehrami2002@hotmail.com |
| Data Protection Officer | **[TO COMPLETE — a DPO is likely NOT legally mandatory at this scale (Art. 37), but confirm. If none, state "no DPO appointed; controller is the privacy contact".]** |
| Lead supervisory authority | Belgian Data Protection Authority (Gegevensbeschermingsautoriteit / Autorité de protection des données), Brussels |
| DPIA owner | Arian Behrami |
| Review cycle | On any material change to processing; otherwise at least annually |
| Date of next scheduled review | **[TO COMPLETE]** |

---

## 1. Why a DPIA is required (Art. 35 screening)

A DPIA is **mandatory** here. The processing meets several of the criteria that oblige one, both under Article 35(3) and the EDPB's nine-criteria guidance (WP248):

1. **Systematic monitoring of a publicly accessible area / tracking of location.** The core feature continuously processes users' geographic position to place them on a shared map. Location data that reveals a person's movements, home, and routines is repeatedly flagged by regulators (WP29 Opinion 5/2005 on geolocation; EDPB guidance) as high-risk.
2. **Data processed on a large scale** (intended: a whole city, then more), including data that, while not special-category in the strict Art. 9 sense, is **highly sensitive** — real-time location plus identity.
3. **Matching / combining datasets** — availability, location, pace, schedule and social graph are combined to suggest people to meet.
4. **A novel use of technology** to bring **strangers together in physical space**, which introduces offline safety risks (stalking, harassment, unwanted contact) that ordinary apps do not carry.
5. **Vulnerable data subjects may be affected** — if minors are not effectively excluded (see §5, R7), and women specifically (the app offers women-only runs, implying an at-risk group it must protect).

Because more than two criteria are met, and because the offline-safety dimension is severe, this is unambiguously high-risk processing. **Prior consultation with the APD (Art. 36) should be actively considered** and is likely required if any residual risk in §6 remains "High".

---

## 2. Description of the processing

### 2.1 Nature and purposes

| Purpose | What it involves | Lawful basis (Art. 6) |
|---|---|---|
| Provide the account & core service (auth, profile, run tracking, gamification/XP, streaks, badges) | Store credentials, profile, and the user's own run history | **Contract** — 6(1)(b) |
| Show nearby available runners & let people arrange to meet | Process approximate location of users who have turned availability on, and display them to others nearby | **Consent** — 6(1)(a) — location sharing is opt-in per session; see §4.1 |
| Social feed, groups, hotspots, direct messages | Store user-generated content and communications | **Contract** — 6(1)(b) |
| Safety, moderation & abuse handling (reports, blocks, evidence snapshots) | Retain reports and moderation records | **Legal obligation / legitimate interests** — 6(1)(c)/(f) — keeping a safe platform |
| Push notifications | Store per-device FCM tokens; send transactional pushes | **Consent** (device permission) + **legitimate interests** for essential/transactional |
| Product analytics | Usage events (no location, no content) via PostHog | **Consent** — 6(1)(a) — **currently a gap, see R5** |
| Error tracking / reliability | Exception data via Sentry (session replay disabled) | **Legitimate interests** — 6(1)(f) |

### 2.2 Categories of personal data

- **Identity & contact:** name, email, hashed password (scrypt), city.
- **Profile:** avatar, bio, preferred sport, pace level, schedule preference, and **optionally gender** (used to gate women-only runs).
- **Location (the sensitive core):**
  - Approximate current position shared while "available" (see mitigations in §4.2 — coordinates are reduced to a ~200 m grid server-side before any other user sees them).
  - **Exact GPS traces** of recorded runs (stored while the account exists).
  - The user's stored profile lat/lng.
  - User-defined **safe zones** (home/work areas) — these are, in effect, home-address data, and are treated as the most sensitive item held.
- **Social / behavioural:** buddies, groups, hotspot participation, feed posts, likes, comments, direct & group messages, XP/streak/badge state, run ratings.
- **Device / technical:** FCM push tokens, platform, session records (token stored **hashed**, SHA-256), IP address (transiently, in logs / rate-limiting).
- **Consent records:** timestamp and **policy version** accepted.

> **Note on special categories (Art. 9):** Runsemble does not intentionally process Art. 9 data. However, (a) **gender** combined with women-only features is sensitive, and (b) **location patterns can indirectly reveal** religious observance (regular visits to a place of worship), health (a clinic), or sexual orientation. This indirect inference risk is a core reason the location minimisation in §4.2 exists and must be maintained.

### 2.3 Data subjects

Registered users (initially adult runners in Antwerp). People who are **tagged as run companions** or **named in reports** are also data subjects even if the tagging user entered the data.

### 2.4 Recipients / processors (sub-processors)

All are engaged as **processors** under Art. 28; a signed Data Processing Agreement (DPA) must be in place with each. **[TO COMPLETE: confirm each DPA is signed and dated.]**

| Sub-processor | Purpose | Data reaching them | Location / transfer basis |
|---|---|---|---|
| Vercel | App & API hosting, Blob storage (post images) | Effectively all request data; images | Compute pinned to **fra1 (EU)**; confirm Blob region & Vercel DPA/SCCs |
| Neon | PostgreSQL database | All stored personal data | **eu-central-1 (EU)** |
| Google Firebase Cloud Messaging | Push delivery | Push tokens + notification payloads | Google (US) — **transfer safeguard required (SCCs / adequacy)** |
| PostHog | Product analytics | Usage events, user id — **no location, no content** | **EU cloud (eu.i.posthog.com)** |
| Sentry | Error tracking | Exception data, request metadata — **session replay OFF** | **EU (de.sentry.io)** |
| Resend | Transactional email (verification, reset) | Email address, email content | Confirm region & DPA — **likely US transfer** |
| CARTO / OpenStreetMap tiles | Base map imagery | Tile requests (may expose approximate viewport/IP) | Confirm provider & DPA |
| Nominatim (OpenStreetMap) | Geocoding / place lookup | Query coordinates or place text | OSMF — confirm terms & whether self-host is warranted at scale |

> **Transfers outside the EEA** (Google/FCM, likely Resend) must each rest on a valid Art. 46 mechanism (SCCs) plus a transfer impact assessment. **[TO COMPLETE: document the safeguard for each US processor.]**

### 2.5 Data flow (summary)

1. Device captures location → sent to the API over TLS.
2. Server stores the exact position but **derives a ~200 m-grid approximation** for anything another user can see; if the point falls inside one of the user's safe zones, **no location is shared at all**.
3. Discovery queries return only approximate positions of currently-available, visible users, minus anyone blocked.
4. Run GPS traces are stored for the owner; when a run is shared to the feed, the trace is **projected** — start/end blinded within 250 m and the path thinned — so a viewer cannot read the runner's front door off it.
5. Analytics/error events (no location, no message content) flow to EU-hosted PostHog/Sentry.

---

## 3. Consultation

- **Data subjects / prospective users:** **[TO COMPLETE — e.g. pilot-user feedback on the privacy model; recommended before launch.]**
- **Processors:** reviewed each provider's stated security & region posture (see §2.4); DPAs **[TO COMPLETE]**.
- **DPO / legal counsel:** **[TO COMPLETE — this draft has not been reviewed by a lawyer.]**
- **Supervisory authority:** not yet consulted; see §7 on whether Art. 36 prior consultation is triggered.

---

## 4. Necessity and proportionality

### 4.1 Lawfulness, fairness, transparency (Art. 5(1)(a), 6, 7, 13)

- A **privacy notice** exists at `/privacy` and a consent step is enforced at signup, with the **accepted policy version now recorded** (so the controller can evidence *what* each user agreed to — a control most apps lack).
- **Gaps:**
  - The published notice currently names only one processor (Vercel). Article 13 requires informing users of **all recipients**. → **R6 / Action A3.**
  - Consent is collected as a **single all-or-nothing step**. Location discovery and analytics are distinct purposes and should be **separately consentable and withdrawable** (Art. 7(3) — withdrawal as easy as giving). → **R5 / Action A2.**

### 4.2 Data minimisation & purpose limitation (Art. 5(1)(b)(c)) — strengths

The build already embodies substantial minimisation, which materially lowers risk:

- **~200 m server-side location grid** — exact coordinates are never returned to other users; the reduction happens on the server, so exact positions aren't exposed in the network response either.
- **Safe zones** — total location suppression around user-defined sensitive places (home/work).
- **Default privacy** — profiles share **no** location unless the user actively turns availability on.
- **Feed GPS projection** — shared-run traces have both endpoints blinded and the path thinned.
- **Analytics minimisation** — no location and no message content sent to PostHog; Sentry **session replay disabled** by deliberate choice.

### 4.3 Accuracy, storage limitation (Art. 5(1)(d)(e))

- **Storage limitation is the main proportionality gap.** Exact GPS run traces and the stored profile lat/lng are retained **for the life of the account** with no automatic expiry or coarsening. Verification codes correctly expire and are single-use, but location has no retention ceiling. → **R2 / Action A4.**

### 4.4 Data subject rights (Art. 12–22) — strengths

- **Right of access & portability (Art. 15/20):** `/api/auth/export` returns a machine-readable bundle of the user's profile, runs, posts, comments, likes, badges, buddies, notifications, messages, hotspot/group/challenge participation, and invites.
- **Right to erasure (Art. 17):** `/api/auth/account` DELETE removes the account; all relations cascade in the schema, and stored images are deleted from Blob first. Session-scoped, so only the account holder can trigger it.
- **Rectification:** profile is user-editable.
- **Art. 17(2) — erasure reaching processors:** deletion now calls `eraseFromProcessors()` (`src/lib/processor-erasure.ts`) after the account row is removed. Each recipient in §2.4 was checked rather than assumed:
  - **PostHog** — holds a Person profile keyed to our user id (`posthog.identify`). Deleted via the API, with `delete_events=true`: removing the profile while leaving the events would leave the behavioural record intact under a detached distinct id, which is not erasure. **Requires `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`** — until those are set the call reports `not-configured`, logs an error, and `/api/admin/diagnostics` warns. **In that state Art. 17(2) is NOT met and each deletion needs a manual erasure in the PostHog UI.**
  - **Sentry** — nothing calls `Sentry.setUser`, so no app user id reaches it. No erasure target. (It still receives IP addresses by default; that is a retention question, not an erasure one.)
  - **Resend** — transactional delivery logs against the address, not a profile keyed to our id.
  - **Vercel Blob** — already handled: post images are collected and deleted before the rows holding their URLs disappear.

  It runs after the response and never throws: the account is already gone, so failing the request because a third party was unreachable would tell the user their deletion failed when it did not. Every failure is logged with the user id — **that log is the record that a manual erasure is owed.**

- **Remaining gaps:** no documented **response process/SLA** for rights requests arriving by email rather than in-app; erasure still does not address content the user placed in *others'* conversations. → **Action A5.**

---

## 5. Risk register

Severity and likelihood are the controller's assessment of impact **on the data subject**, pre- and post-mitigation. Scale: Low / Medium / High.

| # | Risk to individuals | Inherent (L×S) | Key mitigations already in place | Residual | Further action |
|---|---|---|---|---|---|
| **R1** | **Stalking / physical harm** — a bad actor uses the map to locate, follow, or ambush someone (the defining risk of a stranger-meetup location app). | High × High | 200 m grid; safe zones; feed-trace projection; default location-off; block & report; women-only option | **Medium** | A1 (safety controls hardening), A6 (retention limits shrink the exposure window) |
| **R2** | **Home/routine inference** from indefinitely-retained exact GPS traces (breach, insider, or lawful-access exposure reveals where someone lives and when they're out). | High × High | Traces are owner-only; feed projection; EU hosting | **Medium** | A4 (retention ceiling + coarsening of old traces) |
| **R3** | **Account takeover → location history exposure.** | Medium × High | Session tokens **hashed** (SHA-256); scrypt passwords; password blocklist policy; email verification | **Low/Medium** | A7 (distributed rate-limiting; consider 2FA later) |
| **R4** | **Profile/graph scraping** to build a picture of who runs where and with whom. | Medium × Medium | Profile endpoints now auth-gated; group/hotspot history not exposed to strangers; approximate-only location | **Low** | Monitor; rate-limit read endpoints (A7) |
| **R5** | **Analytics without valid consent** — usage events processed without a lawful basis / opt-in. | Medium × Medium | EU hosting; no location or content in events; identified-profiles-only | **Medium** | A2 (per-purpose consent + withdrawal) |
| **R6** | **Inadequate transparency** — users not told who receives their data (Art. 13). | Medium × Medium | Notice exists and is versioned | **Medium** | A3 (complete the notice: all processors, transfers, retention, rights) |
| **R7** | **Minors using the service** — location-sharing by children; no age gate. | Medium × High | None currently | **High** | A8 (age gate; Belgium's digital-consent age is 13 — **verify current law** — plus enhanced protections for young users) |
| **R8** | **Unlawful international transfer** (US processors — FCM, possibly Resend) without a valid safeguard. | Medium × Medium | Core data in EU (Vercel fra1, Neon, PostHog, Sentry) | **Medium** | A9 (document SCCs + transfer impact assessment per US processor) |
| **R9** | **Data of non-users** (tagged companions, reported persons) processed without their interaction. | Low × Medium | Reports polymorphic & minimal; companions are counts or existing users | **Low** | Document basis (legitimate interests) and a route to object |

---

## 6. Measures to reduce risk (action plan)

| ID | Action | Addresses | Priority | Owner | Status |
|---|---|---|---|---|---|
| **A1** | Review & harden offline-safety controls: friction on rapid location refresh by a single viewer, abuse-pattern detection, and clear in-app safety guidance for meeting strangers. | R1 | High | Founder + dev | Open |
| **A2** | Split consent by purpose (core service vs. location discovery vs. analytics); make each withdrawable in-app; gate PostHog on explicit opt-in. | R5, §4.1 | High | Dev | **Built** — analytics is now off by default, opt-in at signup, and a withdrawable toggle in profile settings; PostHog only initialises on consent and stops on withdrawal. (Location discovery is already opt-in per session.) |
| **A3** | Rewrite `/privacy` as a full Art. 13 notice: every processor in §2.4, transfer safeguards, retention periods, all data-subject rights, and the APD complaint route. | R6 | High | Founder + legal | **Built** — `/privacy` rewritten to list all processors, legal bases, transfers, retention, every right, and the APD complaint route. *Legal review still recommended.* |
| **A4** | Define & implement a **retention schedule**: cap exact GPS-trace retention (e.g. coarsen or delete after a defined window), auto-expire transient location, and document justifications. | R2, §4.3 | High | Dev | **Built** — a daily Vercel Cron coarsens run traces older than 90 days (endpoints blinded, path thinned), marked so each row is processed once. *Requires `CRON_SECRET` to be set in Vercel.* |
| **A5** | Document a data-subject-request procedure (identity check, one-month SLA per Art. 12(3)); handle erasure of content in others' conversations and third-party notification (Art. 17(2)). | §4.4 | Medium | Founder | Open |
| **A6** | (Covered by A1/A4.) | R1 | — | — | — |
| **A7** | Move rate-limiting to a shared store (per-instance memory currently lets an attacker bypass limits across serverless instances); revisit 2FA. | R3, R4 | Medium | Dev | Open — needs an Upstash (or similar) store |
| **A8** | Add an **age gate** at signup and decide the policy for under-agers (Belgium's digital consent age is **13** — verify against current Belgian DPA Act before relying on it); apply enhanced defaults to young users. | R7 | High | Founder + legal | **Built** — signup now requires a date of birth and blocks under-16 (conservative EEA baseline) both client- and server-side; the age is stored as evidence. *Confirm the threshold with legal.* |
| **A9** | For each non-EEA processor (FCM; confirm Resend), record the Art. 46 safeguard (SCCs) and a transfer impact assessment. | R8 | Medium | Founder + legal | Open |
| **A10** | Complete all **[TO COMPLETE]** fields; sign DPAs with every processor; appoint (or formally decide against) a DPO. | §0, §2.4 | High | Founder | Open |

> **Progress note (2026-07-20):** The four buildable action items — A2, A3, A4, A8 — have been implemented in code. This lowers **R5** and **R6** to Low and moves **R7 (minors)** from High to **Medium** (an age gate now exists; the residual concern is that self-declared age is unverifiable, which is the accepted industry norm). The items that remain are the ones that genuinely need you or a lawyer: A1, A5, A7, A9, A10, and legal review of A3/A8.

---

## 7. Outcome & sign-off

**Provisional assessment:** With the mitigations already built (location minimisation, safe zones, hashed sessions, EU data residency, working export/erasure), several inherent High risks fall to **Medium**. However, **R7 (minors) remains High** until an age gate exists, and **R1/R2 remain Medium** — this is a stranger-meetup location app, and that residual risk is inherent to the product, not a bug.

**Prior consultation (Art. 36):** Because high residual risk remains before the action plan is completed — particularly R1, R2 and R7 — the controller should take a documented decision, **with legal input**, on whether Art. 36 prior consultation with the Belgian DPA is required before launch. Completing A1–A4 and A8 first is the path to being able to answer "no" defensibly.

**Recommendation:** Do **not** open the service to the public (beyond a closed, consenting pilot of adults) until **A2, A3, A4, A8, A10** are complete and this DPIA has been reviewed by a qualified data-protection professional.

| Role | Name | Decision | Date |
|---|---|---|---|
| Controller | Arian Behrami | ☐ Approved ☐ Approved with conditions ☐ Rejected | ______ |
| DPO / legal reviewer | **[TO COMPLETE]** | ☐ Reviewed | ______ |

---

*Prepared as a working draft to be validated by the controller and a qualified data-protection professional. It reflects the state of the application as of 2026-07-20 and must be revised as the processing evolves.*
