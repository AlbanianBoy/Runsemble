# Runsemble — Google Play submission pack

Everything to copy-paste into Play Console once your account is verified.

## Basics
- **App name (max 30):** `Runsemble: Run Together`
- **Category:** Health & Fitness
- **Contact email:** arianbehrami2002@hotmail.com
- **Website:** https://runsemble.net
- **Privacy policy URL:** https://runsemble.net/privacy
- **Default language:** English (add Dutch later for Antwerp)

## Short description (max 80 chars)
```
Find runners near you, join group runs, and never run alone again.
```

## Full description (max 4000 chars)
```
Runsemble is where runners find each other.

Running is better with people — you show up, you push a little harder, and it
becomes something you look forward to. Runsemble helps you find runners near
you, join runs already happening, and turn solo miles into a habit you keep.

FIND YOUR PEOPLE
• See runners nearby on a live map
• Join group runs happening around you
• Create your own runs and invite others

TRACK EVERY RUN
• GPS tracking with your route, distance, pace, and splits
• Runs keep recording even with the screen off
• Review your history and share your best runs

STAY MOTIVATED
• Build streaks and earn XP as you run
• Climb participation-first leaderboards — showing up counts
• Join community challenges

BUILT AROUND GROUPS
• Start or join running groups
• Group chat and shared runs
• See who's running this week

SAFE BY DESIGN
• Your exact location is never shared — only an approximate area
• Block and report anyone
• Export or delete your data anytime

Because together is better.

Runsemble is starting in Antwerp. Lace up and find your next run.
```

## Data safety form — exactly what to declare
Runsemble **collects** these; it does **not sell** data and does **not** use it for ads.

| Data type | Collected | "Shared"* | Purpose | Required |
|---|---|---|---|---|
| Name | Yes | No | Account, social profile | Yes |
| Email address | Yes | No | Account management, sending verification/reset emails | Yes |
| Approximate location | Yes | No | Show nearby runners/runs (shown to other users only as a ~200 m fuzzed area) | Optional |
| Precise location | Yes | No | Run tracking (route) — incl. **in the background** during an active run | Optional |
| App activity (runs, posts) | Yes | No | Core features, feed, leaderboards | No |
| Photos (optional post images) | Yes | No | User-shared posts | No |

*"Shared" in Play = transferred to a **third-party company**. We don't do that. Other
*users* seeing your fuzzed area is in-app functionality, not third-party sharing.

**Security practices to tick:**
- Data is encrypted in transit ✅
- Users can request data deletion ✅ (in-app: Profile → delete account)
- (We also let users export their data.)

## Content rating questionnaire — honest answers
- User-generated content / user interaction: **Yes** (feed posts, group chat)
- Users can share location with each other: **Yes** (approximate)
- Violence / sexual / gambling / drugs: **No**
- Expected result: **Teen / PEGI 12-ish** (social + location sharing). That's fine.

## Background location declaration (REQUIRED — Google reviews this)
When Play asks why you need background location, use:
```
Runsemble is a running app. When a user starts tracking a run, the app records
their GPS route even when the screen is off or the app is in the background, so
the run keeps recording while they run. Background location is used ONLY during
an active run the user starts, and stops when the run ends. A persistent
notification is shown while tracking is active.
```
You may also be asked for a short demo video showing: the permission prompt →
starting a run → the tracking notification. We'll record that from your phone.

## Store graphics — checklist
- [x] App icon 512×512 — `store/play-icon-512.png`
- [x] Feature graphic 1024×500 — `store/feature-graphic.png`
- [ ] Phone screenshots (min 2, recommend 4–6) — captured from the app next

## Release setup
- App ID: `net.runsemble.app`
- Start with **Internal testing** or **Closed testing** track (invite your pilot
  runners by email) before Production — safest way to launch a first cohort.
