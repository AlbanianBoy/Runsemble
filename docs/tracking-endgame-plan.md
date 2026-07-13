# Tracking Endgame Plan — kill the screen-off straight line for good

**Status:** approved by founder 2026-07-13. This is the execution spec. Work through phases in order; each phase has acceptance criteria. Do NOT invent alternative approaches — the diagnosis below is backed by on-device evidence.

**Device under test:** founder's Samsung SM-A515F (Galaxy A51, One UI, worst-case OEM power management). If it works here, it works everywhere.

---

## 0. Evidence ledger (why we know what we know)

All measured on-device, today:

| Condition | Result | Conclusion |
|---|---|---|
| Foreground, screen on | ~18 pts/min, perfect route + distance | Hardware, filters, math all correct |
| Screen off, before any fix | 2 pts total → straight line | WebView JS frozen (delivery) |
| Screen off, after native buffer fix | 12 pts / 40 min | Delivery fixed; **collection** throttled |
| Screen off, after typed FGS + wake lock | 25 pts / 3:17 | Improved, not cured |
| Screen off, after state-aware batching | **5 pts / 7:43, `+rej = 0`, clear sky, phone in hand** | Collection stalled **upstream of all our code**; got WORSE after batching |

Key instrument: the native fix buffer (in the patched plugin) records every fix the OS delivers, independent of the WebView. 5 fixes in 7:43 with zero rejections = Google Play Services stopped delivering. Not our filters, not our JS, not signal (clear sky, in hand).

Current state of the codebase (all committed, on `main`):
- Patched plugin via patch-package: `patches/@capacitor-community+background-geolocation+1.2.26.patch`
  - Native fix buffer + `getBufferedLocations()` (Android + iOS)
  - 3-arg typed `startForeground(..., FOREGROUND_SERVICE_TYPE_LOCATION)` on API 29+
  - `PARTIAL_WAKE_LOCK` held while watching (6h safety timeout)
  - State-aware batching: `setBackgroundMode()` re-registers the FLP request from `handleOnPause`/`handleOnResume` — **this is Suspect #1, see Phase 1**
- JS: `src/lib/geo-watch.ts` (`drainBufferedLocations`, `nativeBufferSupported`), `src/components/runsemble/run-tracker.tsx` (drain on resume + 2s tick, dedup by fix time, `Npts`/`+Nrej` chip), `src/lib/run-math.ts` (`ACCURACY_GATE_M = 45`)
- `postinstall` = `scripts/postinstall.mjs` (skips patch-package on Vercel — do not regress this)
- Founder device settings already done: battery Unrestricted, not in sleeping apps, Adaptive battery OFF.

---

## 1. Root-cause analysis

**Culprit A — our own batching change (high confidence, fix first).**
`BackgroundGeolocationService.setBackgroundMode()` calls `removeLocationUpdates` + `requestLocationUpdates` from the plugin's `handleOnPause` — i.e. re-registers the location request *as the app enters the background*. Requests registered/evaluated as background get Android's background-location cap ("a few updates per hour"). Numbers match: screen-off rate went from ~7.6 pts/min (before batching) to ~0.65 pts/min (after). Re-registering in the background likely downgraded our own request.

**Culprit B — Samsung/GMS screen-off throttling (the residual ~40% degradation seen even before batching).**
One UI throttles GNSS + FLP delivery on screen-off for non-allowlisted apps even with a typed FGS + wake lock. This is the layer commercial plugins (Transistorsoft) sell workarounds for, and why raw-GNSS fallback (Phase 1.3) exists.

**Why Strava works out of the box:** fully native pipeline; raw `GPS_PROVIDER` fallback bypassing Play Services; and OEM internal allowlists that pre-whitelist popular apps. Even so, Strava's own help docs tell Samsung users to change battery settings. We compensate with Phase 1 + Phase 3.

---

## 2. Phase 0 — Forensics built into the service ("flight recorder")

Goal: every future walk produces a forensic file; no adb needed during walks.

In the patched `BackgroundGeolocationService.java`:
1. Append one JSON line per event to `context.getFilesDir()/gps-flightlog.jsonl` (rotate/truncate at 2 MB):
   - every `onLocationResult` → `{t, kind:"fix", lat?, lng?, acc, provider}` (lat/lng optional — count + accuracy is enough; avoid PII bloat)
   - every `onLocationAvailability(false)` → `{t, kind:"lost"}` — **currently ignored; this is GMS telling us it stopped. Must log.**
   - watchdog events, provider switches, wake-lock acquire/release, `startForeground` success/failure + Build.VERSION
2. Plugin method `getFlightLog()` → returns file contents; JS dev-only surface (e.g. long-press the GPS chip → copy to clipboard) or read via adb.
3. Optional stationary experiment (no walking): wireless debugging (NOT USB — a cable counts as charging and disables the throttling being hunted), start a run, `adb shell dumpsys location > before.txt`, screen off 3 min, `dumpsys location > during.txt`, diff our package's request section + gnss section. Also check `adb shell dumpsys package net.runsemble.app | grep -i background_location` (is "Allow all the time" actually granted?) and `adb shell appops get net.runsemble.app`.

**Acceptance:** after a 3-min screen-off walk, the flight log clearly shows either fixes arriving (→ delivery problem, unlikely) or a gap + "lost" events (→ collection stall confirmed at GMS level).

---

## 3. Phase 1 — Corrections + raw-GNSS watchdog (highest probability cure)

All in the patched plugin (Android). Regenerate the patch after edits: `rm -rf node_modules/@capacitor-community/background-geolocation/android/build && npx patch-package @capacitor-community/background-geolocation` (the build-dir rm avoids Windows filename-too-long).

1. **Remove the onPause/onResume re-registration entirely.** Delete `setBackgroundMode` calls from `handleOnPause`/`handleOnResume` (keep the method if useful for flushing). Register the FLP request ONCE, while foreground, with fixed params: `interval=1000`, `maxWaitTime=5000` (mild batching always; foreground marker tolerates 5s because the JS drain ticks every 2s and the live callback still fires per batch), `PRIORITY_HIGH_ACCURACY`, `smallestDisplacement=0` (let JS filters do the work — the 5m hardware filter costs points when accuracy is poor).
2. **On resume: `client.flushLocations()`** instead of re-registering. Never call `requestLocationUpdates` while the host activity is paused.
3. **Callbacks on a dedicated `HandlerThread`** owned by the service: pass its `Looper` to `requestLocationUpdates(request, callback, looper)` instead of `null` (null = main thread = shared with WebView).
4. **Starvation watchdog + raw-GNSS fallback** (the GPSLogger/Strava trick, bypasses Play Services):
   - In the service, on the HandlerThread: every 20s, if watching and `now - lastFixTime > 30_000`:
     - log watchdog event; escalate once: `LocationManager.requestLocationUpdates(GPS_PROVIDER, 1000, 0f, listener, handlerThreadLooper)` (guard `SecurityException`; needs no new permissions — FINE_LOCATION covers it)
     - raw fixes feed the SAME buffer/broadcast path, tagged `provider:"gps"`
     - if FLP resumes (fresh FLP fix seen), optionally drop the raw listener after 60s of healthy FLP; keep hysteresis simple
   - Watchdog only runs while a watcher exists; tears down with the service.
5. iOS: no changes (CoreLocation doesn't have this failure mode; buffer port already shipped in the patch).

**Test protocol (founder):** rebuild + reinstall (Android Studio: Sync Gradle → Run, phone plugged; unplug before testing). Outside, start run, confirm pts climbing, screen OFF, phone in hand at side, walk 5 min, screen ON. Read `Npts`/`+rej`, route shape, and pull the flight log.

**Acceptance:** ≥ 8 pts/min average over the screen-off window on the SM-A515F; route curves; distance within ~15% of reality. If the watchdog fired, the flight log shows the provider switch and raw-GPS fixes flowing — that confirms Culprit B and the fallback becomes permanent. If still starved even on raw GNSS, the flight log gap pattern goes to Phase 2 with forensic backing.

---

## 4. Phase 2 — `RunRecorder` native module (the "be Strava" core)

Do this after Phase 1 regardless of outcome (launch-grade robustness); it subsumes the plugin patches over time. Keep the hybrid UI — the UI was never the problem.

Custom local Capacitor plugin (e.g. `native/run-recorder/` wired via `capacitor.config` `includePlugins` or a local npm workspace — NOT another node_modules patch):

- **Kotlin foreground service, STARTED not just bound** (`startForegroundService`, `START_STICKY`), typed `location`, wake lock, HandlerThread, watchdog + raw-GNSS fallback from Phase 1.
- **Owns the session:** `startTracking({runId})` / `stopTracking()` / `getActiveSession()` / `getTrack({runId, sinceIndex})` / `clearTrack({runId})`.
- **Persists every fix to disk as it lands:** append-only JSONL in `filesDir/runs/{runId}.jsonl` — `{t, lat, lng, acc, provider}`. Survives WebView death, app kill, low memory. (This replaces localStorage crash-recovery as source of truth; keep the localStorage path as fallback for web.)
- **Notification shows live state** (elapsed; optionally native-computed distance for display only — JS run-math stays the single source of truth for the saved run, computed from the full persisted track on finish/resume).
- JS integration: `run-tracker.tsx` on native uses `getTrack(sinceIndex)` polling (2s) + on-resume instead of the buffer drain; cold launch calls `getActiveSession()` and reattaches. Web path unchanged.
- iOS twin later (CoreLocation + same JS API); lower urgency — iOS lacks this failure mode.

**Acceptance:** kill the app mid-run (swipe away) during a screen-off walk → reopen → full track intact from disk; A51 10-min screen-off walk ≥ 8 pts/min; battery drain sane (< ~5%/hr tracking).

---

## 5. Phase 3 — Reliability UX + fleet telemetry

1. **One-time "tracking check" screen** (first run start on native): detect `Build.MANUFACTURER`; for Samsung/Xiaomi/Huawei/Oppo show 1–3 device-specific steps with deep links (Samsung: Never-sleeping apps list; intent `com.samsung.android.sm` battery screen where available, else app-info screen). One button each, "done" checklist, persist completion. Copy tone: honest, 20 seconds, "Android kills trackers it doesn't know yet — tell your phone Runsemble is a tracker."
2. **Telemetry on run save:** attach `pointCount`, `rejectedCount`, screen-off ratio, provider mix (flp/gps), `Build.MODEL` to the run-save payload (extend API + Prisma columns is founder-gated schema change — batch it with the next migration). Dashboard question to answer: "what % of runs are tracking-healthy, by device?"

---

## 6. Definition of done

- SM-A515F: 10-min screen-off pocket walk → curved route, distance within 15%, no user-visible gaps.
- Run survives app kill mid-run.
- New-user setup burden: at most the one-time 20-second tracking check.
- Fleet telemetry proves it across other users' devices post-launch.

## 7. Guardrails for implementers

- Never re-register location requests while backgrounded (Culprit A). `flushLocations()` is the wake-up tool.
- Never remove the Vercel skip in `scripts/postinstall.mjs`; regenerate the patch file after ANY edit under `node_modules/@capacitor-community/background-geolocation`, and rm the plugin's `android/build` dir first.
- Don't swap GPS plugins (community plugin is a deliberate decision; @capgo and Transistorsoft were evaluated and rejected).
- JS changes deploy via web (reopen app); native changes need Android Studio rebuild + reinstall. Say which one every time you ship something.
- Keep `ACCURACY_GATE_M` and all filter tuning in `src/lib/run-math.ts` with tests (`npm test`), never inline in the component.
