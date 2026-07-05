# Runsemble — Research Pilot Kit

A 4-week concierge pilot in one Antwerp district. Goal: learn whether Runsemble
makes runs between people actually happen — before spending on launch.

## Setup (week 0)

- Pick ONE district (e.g. Zuid/Stadspark). Density beats coverage.
- Recruit 15–25 runners: 1 local running club, 2–3 cafés/gyms with a flyer+QR,
  your own network. Mix levels; aim for ≥40% women (tests the safety features).
- Create 3 official recurring runs at real times you can personally attend
  (e.g. Tue 18:30 Stadspark easy 5K, Thu 19:00 Scheldekaaien tempo, Sun 10:00 long).
- Run a parallel WhatsApp group. The gap between what people do there vs. in
  the app IS the roadmap.

## Weekly rhythm (weeks 1–4)

- Attend every official run. You are the concierge: greet, introduce people,
  ask them to check in via the lobby.
- Monday: send the week's runs in-app (feed post) AND WhatsApp.
- Friday: 3 short user calls (15 min, script below).
- Log every session in a simple sheet: run, # joined in app, # checked in,
  # actually present, # new-pair introductions.

## Interview script (15 min)

1. Tell me about your last run with another person. How did it get arranged?
2. Walk me through the last time you opened Runsemble. What were you hoping for?
3. What almost stopped you from coming to a run this week?
4. (Show lobby) If you tapped "I'm here" and nobody else did — what would you do?
5. Safety: what would you need to feel okay meeting a stranger from this app?
6. If Runsemble disappeared tomorrow, what would you miss? What wouldn't you miss?
7. Who is one person you'd bring? What would you tell them it is?

Listen for: arrangement friction (the job-to-be-done), flake anxiety,
safety thresholds, and the words THEY use to describe the app.

## Metrics that decide launch readiness

| Metric | How | Green light |
|---|---|---|
| Join → check-in rate | lobby check-ins / joins | ≥ 60% |
| Weekly runs with 2+ people | sessions sheet | ≥ 3/week sustained |
| Week-2 return rate | users active in week N+1 | ≥ 50% |
| New-pair rate | buddy links created / week | ≥ 5/week |
| WhatsApp bypass | coordination happening off-app | trending DOWN |

If join→check-in is red: the problem is commitment, not discovery →
reminders + social pressure (who's coming) before any new features.
If week-2 return is red: the problem is habit → recurring runs + streaks,
not more content.

## Demoing the app (no GPS needed)

Run tracker → "simulate a run (demo mode)" drives a fake runner around
Stadspark: live trail, pace, splits, save-to-feed route card. Use it in every
interview and pitch.

## Before real strangers use it (engineering checklist)

- [x] Session auth on all writes + private reads (done)
- [x] Geofenced check-in, block/report, location fuzzing (done)
- [ ] Deploy: Vercel + Neon/Supabase Postgres (needs accounts, ~1h)
- [ ] Native wrapper (Capacitor) for background GPS + push (needs dev accounts)
- [ ] Privacy policy reviewed by a human lawyer (consent/export/delete exist)
