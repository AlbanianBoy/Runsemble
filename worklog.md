# Runsemble — Development Worklog

---
Task ID: 1
Agent: main
Task: Set up Prisma database schema

Work Log:
- Created comprehensive schema with 9 models: User, Hotspot, HotspotParticipant, RunGroup, GroupMember, FeedPost, ChatMessage, GroupChatMessage, UserBadge, RunRating, RunInvite
- Each model has appropriate fields, relations, and indexes
- Pushed schema to SQLite database successfully

Stage Summary:
- Database schema covers all MVP features: users, hotspots, groups, feed, chat, badges
- Relations properly set up (one-to-many, many-to-many through join tables)

---
Task ID: 2
Agent: main
Task: Create seed data for demo

Work Log:
- Created 8 diverse users (Maya, Jonas, Sophie, Lars, Emma, Kai, Anja, Tomas)
- Created 6 hotspot runs at Antwerp locations
- Created 4 groups (2 public, 1 trail, 1 private)
- Created 8 feed posts with varied content types
- Added 18 badges across users
- Added group chat messages
- Added hotspot participants

Stage Summary:
- Rich demo data with realistic Antwerp-based content
- Users have varying XP, streaks, and paces
- Feed posts include milestones, questions, and moments

---
Task ID: 3-9
Agent: main
Task: Build complete Runsemble UI with all tabs

Work Log:
- Created Zustand store with app state, navigation, and onboarding management
- Built onboarding flow (welcome question + profile setup)
- Built Feed tab with 'What's happening' strip, social feed, post creation
- Built Map tab with simulated map, hotspot/runner markers, availability toggle
- Built Hotspots tab with timeline view and join functionality
- Built Groups tab with list/detail/chat views, create group
- Built Profile tab with XP progress, rank, streak, badges
- Built bottom navigation with glass effect and tab indicator
- Created 12 API routes for all CRUD operations
- Updated globals.css with warm orange brand palette and utility classes
- Updated layout.tsx with Runsemble branding
- Split UI into 7 component files in src/components/runsemble/

Stage Summary:
- Complete mobile-first app with 5 tabs
- All tabs connect to real API routes via TanStack Query
- Warm orange brand palette with glass morphism effects
- Framer Motion animations for tab transitions
- Onboarding flow with the signature "When did you last feel good?" question

---
Task ID: 10
Agent: full-stack-developer (sub-agent)
Task: Build API routes

Work Log:
- Created 12 API route files covering all CRUD operations
- Routes: users, users/[id], hotspots, hotspots/[id], hotspots/[id]/join, groups, groups/[id], groups/[id]/join, groups/[id]/chat, feed, feed/[id]/like, badges
- All routes use Prisma ORM via @/lib/db
- Proper error handling with try/catch
- Computed fields like minutesUntil, participantCount

Stage Summary:
- All API routes functional
- Hotspot API includes computed minutesUntil and participant data
- Feed API includes author info and group info
- Group chat API verifies membership before sending

---
Task ID: 11 (Bug fixes - previous session)
Agent: main
Task: Fix critical bugs from initial QA

Work Log:
- Fixed "Oops" crash by creating providers.tsx with QueryClientProvider
- Fixed API response shape mismatch in all 5 tab components (unwrapped `data.posts`, `data.hotspots`, etc.)
- Fixed field name mismatches (`authorName` → `author?.name`)
- Fixed groups API to return all groups with `isMember` and `messageCount` computed fields
- Fixed join/leave mutations to pass userId

Stage Summary:
- Root crash resolved
- 6+ data mismatch issues fixed across all tab components

---
Task ID: 12 (Bug fixes - current session)
Agent: main
Task: Fix onboarding stuck, empty hotspots, and data issues

Work Log:
- Fixed `_hydrated` flag: Changed from direct state mutation to `useRunsembleStore.setState()` in `onRehydrateStorage` callback for proper React re-renders
- Fixed `OnboardingProfile` API response unwrapping: Was spreading `{ user: {...} }` directly instead of extracting `data.user`
- Added explicit error handling for non-ok API responses
- Fixed hotspot seed data: All 6 hotspots now use future `startTime` values (1.5h to 28h from now)
- Created comprehensive seed script with 8 users, 6 hotspots, 4 groups, 10 posts, 18 badges, 17 chat messages, 6 DMs, 4 invites
- Fixed `map-tab.tsx`: Added `privacyVisible` filter for available runners, added loading skeleton
- Fixed `hotspots-tab.tsx`: Fixed `isJoined` computation (was checking undefined `h.joined`), now computes from participants array. Added empty state.
- Fixed `groups-tab.tsx`: Fixed `messageCount` → `totalMessages` field name. Added loading skeletons and empty states.
- Fixed `package.json` dev script: Removed `| tee dev.log` pipe that caused server to die
- Created seed API route at `/api/seed` for database reseeding

Stage Summary:
- Onboarding flow fully works: Welcome → select option → "Let's go" → Profile form → Submit → Main app
- Hotspots now show 6 upcoming runs with real future times
- All API response unwrapping verified correct across all tabs
- Lint passes with zero errors

---
Task ID: 13 (Features + Polish)
Agent: full-stack-developer (sub-agents)
Task: Add create hotspot, profile editing, availability toggle, and UI polish

Work Log:
- **Hotspots - Create Run FAB**: Added floating action button (+) with full creation dialog (name, description, location, sport type, distance, pace range, start time). Uses `openCreateDialog` callback to reset form on each open.
- **Profile - Edit Dialog**: Added pencil icon + "Edit Profile" button. Dialog with name, bio, city, pace level, schedule preference fields. Calls PUT /api/users/[id] and updates Zustand store.
- **Profile - Availability Toggle**: Prominent card with pulsing green dot when available, 45-minute countdown timer with progress bar, auto-expiry. Uses `updateProfile()` for optimistic store updates.
- **Profile - PUT API**: Updated `/api/users/[id]/route.ts` with PUT handler for profile updates and availability toggling.
- **Feed - Like Toggle**: Added optimistic local `likedPosts` Set. Hearts fill red with scale+rotate pop animation. Like count updates optimistically.
- **Feed - Card Animations**: Post cards have `hover:shadow-md hover:-translate-y-0.5`. Staggered entrance animation (0.06s per card). "Next Run" card has animated gradient overlay.
- **Feed - Stats Cards**: Removed colored borders, added `shadow-sm hover:shadow-md`. Streak icon pulses, runner icon sways.
- **Bottom Nav - Active Indicator**: Sliding top bar with spring animation. Active dot slides smoothly. Icons scale up and shift on active. Tap feedback with `whileTap={{ scale: 0.88 }}`.
- **Bottom Nav - Badge**: Animated unread count with rose-500 color, `9+` format, `min-w-[16px]`.
- **Onboarding - Skip Button**: "Skip for now" text link fades in after 0.8s.
- **Onboarding - Background**: Three floating animated circles + SVG diagonal pattern at 4% opacity.
- **Onboarding - Progress Dots**: 2-dot indicator showing current step, active dot stretches to pill shape.
- **Onboarding - Button Polish**: Hover shadows, arrow icon bounce, option buttons with `whileHover={{ scale: 1.02, x: 4 }}`.
- **Helpers**: Added 8+ utility functions: `formatPace`, `formatDuration`, `formatDistance`, `truncateText`, `formatCount`, `relativeTimeLabel`, `clamp`, `getTagColor`.

Stage Summary:
- All lint errors resolved (fixed setState-in-effect issues in hotspots-tab and profile-tab)
- 3 major new features: Create Hotspot, Edit Profile, Availability Toggle
- Comprehensive UI polish across feed, nav, onboarding
- All changes verified via browser testing

---
## Current Project Status

### Assessment
The Runsemble app is **fully functional** with a complete onboarding flow, 5 working tabs, real database-backed data, and polished UI. All critical bugs from the previous session have been fixed. The app passes lint with zero errors.

### Completed Features
1. **Onboarding**: Welcome question ("When did you last feel good?") → Profile setup → Main app
2. **Feed Tab**: Social feed with posts, likes, "Next Run" card, streak/stats cards, post creation dialog
3. **Map Tab**: Simulated map with runner avatars, available runner count
4. **Hotspots Tab**: Timeline of upcoming runs, join/leave, create new run (FAB + dialog), expandable details
5. **Groups Tab**: Group list with member counts, detail view, chat, create group
6. **Profile Tab**: XP/rank display, stats, badges, edit profile dialog, availability toggle with 45-min countdown
7. **Bottom Nav**: Animated tab indicator, unread badge, tap feedback
8. **API**: 13 routes covering all CRUD, plus seed endpoint
9. **Database**: 11 Prisma models, rich seed data (8 users, 6 hotspots, 4 groups, 10 posts, 18 badges)
10. **Styling**: Warm orange oklch palette, glass morphism, Framer Motion animations, mobile-first

### Architecture
- **Frontend**: React components in `src/components/runsemble/` (8 files)
- **State**: Zustand store in `src/lib/store.ts` with persist middleware
- **Backend**: 13 API routes in `src/app/api/`
- **Database**: SQLite via Prisma in `prisma/schema.prisma` (11 models)
- **Styling**: Tailwind CSS 4 + shadcn/ui + custom brand utilities in `globals.css`
- **Data Fetching**: TanStack Query with optimistic updates
- **Animations**: Framer Motion for page transitions, micro-interactions

### Unresolved / Next Steps (Priority Order)
1. **Real map integration** — Replace simulated map with Leaflet/Mapbox
2. **WebSocket for real-time updates** — Chat messages, new posts, hotspot joins
3. **Run tracking** — GPS tracking during runs, distance/time recording
4. **Push notifications** — Hotspot reminders, group mentions
5. **Dark mode enhancement** — Currently supported via CSS vars but not fully themed
6. **Post comments** — Comment dialog/replies on feed posts
7. **Image upload** — Post photos, profile avatars
8. **XP awards** — Auto-award XP for joining hotspots, creating posts, maintaining streaks
9. **Invite flow** — Accept/decline run invites with notification
10. **Search** — Search users, groups, hotspots
---
Task ID: 14 (Major upgrade pass — real map, geolocation, XP engine, type safety)
Agent: Claude (Opus 4.8)

Work Log:
- **Real geographic map (was a fake CSS gradient).** Replaced the simulated map —
  which placed markers at hardcoded screen percentages (HOTSPOT_POSITIONS /
  RUNNER_POSITIONS) and threw away the real lat/lng already stored on hotspots —
  with an actual Leaflet + OpenStreetMap map (CARTO Voyager tiles, no API key).
  - New `src/components/runsemble/map-canvas.tsx` (client-only, loaded via
    next/dynamic ssr:false because Leaflet touches `window`).
  - Hotspots now render at their true coordinates; custom div-icon pins with
    participant-count badges and a pulse.
  - Nearby runners render at PRIVACY-FUZZED coordinates (~200m grid, the concept's
    promise) with a translucent "approximate area" circle. Avatar colours match
    the rest of the app.
  - Current user marker + availability state; "X runners nearby" chip; distance
    label ("~600 m away") in the runner sheet via haversine.
- **User geolocation added to the data model.** `lat`/`lng` (Float?) added to the
  User model in schema.prisma, and to all 8 seeded users in BOTH seed paths
  (`seed-db.ts` and the canonical `src/app/api/seed/route.ts`). This is what makes
  "runners near you" real instead of randomly placed.
- **Working XP engine (was decorative).** New `src/lib/xp.ts` (server-only):
  `awardXp()` increments XP and detects rank-ups; `grantBadge()` grants once.
  Wired into the hotspot-join route: joining now awards +50 XP, grants a first-run
  badge (and a 5-run badge), and returns the result. The client celebrates with a
  sonner toast ("+50 XP", or "Rank up! You're now Pacer") and updates the store so
  the profile reflects new XP immediately.
- **Type-safety pass.** Removed every `: any` / `as any` from the five tab
  components. New shared `src/lib/types.ts` (API response contracts),
  `src/lib/api.ts` (typed apiGet/apiSend that surface server error messages),
  `src/lib/ranks.ts` (single source of truth for ranks — de-duplicated from the
  store), and `src/lib/geo.ts` (haversine, coordinate fuzzing, distance labels).
- **Smaller fixes:** consolidated duplicate rank logic; made `start-server.sh`
  portable (was hardcoded to /home/z/my-project); excluded stray `examples/`
  scaffolding from the typecheck; cleaned 2 pre-existing shadcn lint errors.

Verification:
- `npx tsc --noEmit` → 0 errors.
- `npx eslint .` → 0 errors.
- NOTE: the Prisma *client* could not be generated in the build sandbox (the
  engine binary host is network-blocked), so DB query shapes were validated
  manually against schema.prisma rather than by the typechecker. Run
  `npx prisma db push && npx prisma generate` locally to apply the lat/lng column
  and fully validate.

Run instructions (local):
  1. npm install
  2. npx prisma db push        # adds the lat/lng column
  3. npx prisma generate
  4. npm run dev               # then POST /api/seed (or hit the seed route) to load demo data

---
Task ID: 15 (Major feature pass — run tracking, gamification, leaderboard, social, dark mode)
Agent: Claude (Opus 4.8)

Work Log:
- **Run tracking (marquee feature).** New `src/components/runsemble/run-tracker.tsx`:
  a full-screen live tracker using the browser Geolocation API (watchPosition)
  to record a real GPS track, accumulating distance via haversine and timing
  with a 1s ticker that only advances while running. Start / pause / resume /
  finish, live pace, a finish summary (distance, time, pace, calories), a
  companions stepper, and a "share to feed" toggle. Degrades gracefully to
  timing-only when GPS is denied/unavailable. Launchable solo (raised centre nav
  button), from a hotspot (map sheet + Runs list), or from a group. Saving POSTs
  to the new `/api/runs`, which records a `RunSession`, moves real stats
  (totalRuns, totalDistanceKm, totalDurationSec, run buddies), computes the
  streak, awards distance-scaled XP, unlocks badges, notifies, and optionally
  posts to the feed.
- **Deeper gamification.** `src/lib/xp.ts` gained `awardXpAmount` (variable XP),
  `computeStreak` (consecutive-day streak logic — the streak system was inert
  before), and 6 new badges (first-track, distance 10/50/100, streak 7/30).
- **Leaderboard.** New `/api/leaderboard` + `leaderboard.tsx`: a podium plus a
  ranked list, switchable by XP / distance / streak / runs, with the current
  user highlighted. Reachable from the profile.
- **Comments (were dead).** New `PostComment` model, `/api/feed/[id]/comments`,
  and `comments-sheet.tsx`. Post counts are now real (`_count`).
- **Likes (were broken).** Replaced the increment-only endpoint with a per-user
  `PostLike` toggle. `/api/feed/[id]/like` now flips the like and keeps the count
  in sync; the feed returns `likedByMe`. Unliking correctly decrements.
- **Notifications (bell was decorative).** New `Notification` model,
  `/api/notifications`, `notifications-sheet.tsx`, and a `notify()` helper wired
  into joins, likes, comments, badges, rank-ups, and runs. Bell shows a live
  unread count and marks-read on open.
- **Dark mode.** Wired up next-themes (ThemeProvider + a CSS-driven ThemeToggle
  in the profile). Made `.glass` and `.gradient-brand-subtle` theme-aware.
- **Modern refresh.** Redesigned the bottom nav around a raised centre "Start"
  action; merged the Runs timeline into Explore via a Map/Runs toggle; added an
  ambient app background; functional header bell + avatar→profile.
- **Curated + user hotspots (both).** Added `Hotspot.isOfficial`; the hotspots
  route rolls official recurring spots forward so they're perpetually available,
  and expires user-created one-offs. Official spots show a badge. Seeds mark 3.
- **Real geolocation.** Onboarding captures the browser position (opt-in) and
  the opening "when did you last feel good" answer now personalises the reply.
- **Schema:** added PostLike, PostComment, Notification, RunSession, plus
  User.totalDistanceKm/totalDurationSec and Hotspot.isOfficial. Seeds updated
  (both seed-db.ts and /api/seed) with distances, official flags, and real likes.

Verification:
- `npx tsc --noEmit` → 0 errors. `npx eslint .` → 0 errors (strict React Compiler
  rules). `npx next build` → success, all 19 routes compile.
- Manually verified in-browser (mobile viewport): onboarding + geolocation card,
  run tracker (start/pause/finish/save with graceful GPS fallback), run save →
  XP/stats/streak/badges/feed post/notification, like toggle + unlike, comments
  add, notifications panel + unread badge, leaderboard (XP + distance metrics,
  you-highlight), official-spot badges, Map/Runs toggle, dark ↔ light toggle.

---
Task ID: 16 (Founder brief: audit → roadmap → design polish pass)
Agent: Claude (Fable 5)

Work Log:
- Committed all prior work: branch `feature/runsemble-v2`, commits 53e0b18
  (v2 features) and eca3553 (this polish pass). Repo-local git identity set.
- **Explicit bug fixes:** verified the sheet z-index fix live — hotspot sheet
  now stacks above the Leaflet map (z-1400) and its Join button is hittable via
  elementFromPoint; fixed bottom-nav Start label overlapping the raised button.
- **Map filters (core concept gap):** pace (any/beginner/intermediate/advanced)
  + distance (<1/<3/<5 km/anywhere) chips filtering both runner markers and
  hotspot pins; nearby-count chip updates live (tested 9→7 markers, 4→2 runners).
- **Feed hierarchy:** replaced three competing animated cards with one next-run
  CTA card (taps through to Explore) + two calm stat cards; killed all
  infinite/looping emoji animations; empty state for the For-you scope;
  running-specific composer copy.
- **Design discipline:** gradient reserved for the Start button + live tracker
  only; toggles/pills/CTAs/FAB now solid primary; solid tracking-tight wordmark;
  removed onboarding diagonal-line pattern; removed duplicate Edit Profile
  button; availability CTA copy → "I'm free to run" / "Available · tap to stop".
- **Chat UX:** auto-scroll to newest message in group chat + DMs; per-message
  timestamps in group chat.
- .gitignore now excludes prisma/dev.db.

Verification: tsc 0 errors · eslint 0 errors · next build green · live-tested
filters, sheet stacking, feed layout, chat; zero console errors.
