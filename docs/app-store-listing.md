# Runsemble — App Store submission pack

Copy-paste into App Store Connect. Apple's fields differ from Google Play, so
this isn't identical to `play-store-listing.md` — mind the Apple-only bits
(Subtitle, Keywords, Promotional Text, the App Privacy "nutrition label", and
the **demo account for App Review**).

## App information
- **Name (max 30):** `Runsemble: Run Together`
- **Subtitle (max 30):** `Find runners, run together`
- **Bundle ID:** `net.runsemble.app`
- **Primary category:** Health & Fitness  ·  **Secondary:** Social Networking
- **Support URL:** https://runsemble.net
- **Marketing URL:** https://runsemble.net
- **Privacy Policy URL:** https://runsemble.net/privacy
- **Primary language:** English (U.K.)  ·  add Dutch later for Antwerp

## Promotional text (max 170, editable anytime without review)
```
Starting in Antwerp: find runners near you, join group runs, and turn solo miles into a habit. Because together is better.
```

## Keywords (max 100 chars, comma-separated, no spaces)
```
running,runners,run club,group run,social,fitness,gps,route,jog,marathon,antwerp,buddy,pace,tracker
```

## Description (max 4000)
```
Runsemble is where runners find each other.

Running is better with people — you show up, you push a little harder, and it
becomes something you look forward to. Runsemble helps you find runners near
you, join runs already happening, and turn solo miles into a habit you keep.

FIND YOUR PEOPLE
• See runners nearby on a live map
• Join group runs happening around you
• Invite someone to run and plan it together

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

## Screenshots — spec
Apple requires **6.7" iPhone** screenshots; everything else is optional and can
reuse the same frames. Capture from a real iPhone or TestFlight, portrait.
- **Required — 6.7" (iPhone 15/16 Plus & Pro Max):** `1290 x 2796` px (or 6.9"
  `1320 x 2868`). Upload **3–6**.
- Optional: 6.5" `1242 x 2688`, iPad only if you later enable iPad.
- **Capture these screens (same set as Play, for consistency):**
  1. The map — runners nearby
  2. A live run — tracking screen (route + stats)
  3. The feed
  4. A group (chat / members)
  5. The leaderboard
  6. Your profile
- Tip: clean status bar, no personal data of real users visible.

## App Privacy ("nutrition label") — how to answer
Runsemble **collects** the below, all **linked to the user's identity** (it's an
account), and **none of it is used to track you** across other apps/companies
(no ads, no data brokers). Set "Used for Tracking" = **No** for everything.

| Data type | Collected | Linked to user | Purpose |
|---|---|---|---|
| Email address | Yes | Yes | App functionality, account management |
| Precise location | Yes | Yes | App functionality (run route — incl. in background during a run) |
| Coarse location | Yes | Yes | App functionality (nearby runners, shown to others only as a ~200 m area) |
| Photos (optional post images) | Yes | Yes | App functionality (user posts) |
| Other user content (posts, comments, messages) | Yes | Yes | App functionality |
| User ID | Yes | Yes | App functionality |

When asked "Do you use data to track you?" → **No**.

## Age rating
Answer the questionnaire honestly:
- User-generated content / can users interact: **Yes** (feed, chat) → declare it.
- Unrestricted web access: **No** (it's your own app, not a web browser).
- Violence / sexual / drugs / gambling: **No**.
- Expected result: **12+** (social + UGC). That's fine.

## App Review Information (REQUIRED — don't skip)
- **Demo account:** App Review must be able to log in. Create a throwaway
  account in the app and put its credentials here, e.g.
  `email: review@runsemble.net  /  password: ********`  (a real, working login).
- **Notes to reviewer:**
```
Runsemble is a running app for finding and running with people nearby.

BACKGROUND LOCATION: When a user starts tracking a run, the app records their
GPS route while the app is backgrounded or the screen is off, so the run keeps
recording until they finish it. Background location is used ONLY during an
active run the user starts. To test: sign in with the demo account, tap Start,
grant "Always" location, lock the screen briefly, reopen — the route continues.

The app's UI is delivered from our server (runsemble.net) inside the native
shell; native capabilities (background GPS via Core Location, notifications) are
provided by the app. It is not a web browser.
```
- **Contact:** your name + email + phone.

## Export compliance
- Uses encryption? **Yes**, but only standard HTTPS → **exempt** (answer "No" to
  "Does your app use non-exempt encryption?"). No extra paperwork.

## Guideline 4.2 note (minimum functionality)
Apple (like Google) can reject thin "web wrapper" apps. Runsemble is low-risk
here because it adds real native value — **background GPS run tracking** — which
is exactly the native capability Apple looks for. If a reviewer raises 4.2, the
reply is: the app provides native background location tracking (Core Location)
that a website cannot, which is core to the product.

## Version / build
- **Version:** `1.0`  ·  build number is auto-incremented by `codemagic.yaml`.
