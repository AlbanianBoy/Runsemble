# Phase 2 RunRecorder — Gap Analysis (Current vs Spec)

**Date:** 2026-07-14  
**Goal:** Skeleton only. No changes to runtime behavior. Everything here is additive and reviewable by Claude.

## Phase 2 Spec (from docs/tracking-endgame-plan.md)

Key requirements:

- Custom local Capacitor plugin (e.g. under `native/run-recorder/`).
- **Kotlin foreground service using `startForegroundService` + `START_STICKY`** (not just bound).
- Typed `FOREGROUND_SERVICE_TYPE_LOCATION` (API 29+).
- Partial wake lock while active.
- HandlerThread for location callbacks (not main thread).
- Watchdog + raw GNSS fallback (from Phase 1 learnings).
- **Owns the session** via `runId`:
  - `startTracking({ runId })`
  - `stopTracking()`
  - `getActiveSession()`
  - `getTrack({ runId, sinceIndex })`
  - `clearTrack({ runId })`
- **Disk-first persistence**: Every accepted fix appended immediately to `filesDir/runs/{runId}.jsonl` as `{ t, lat, lng, acc, provider }`.
  - Survives WebView death, full app kill, low memory, etc.
- Notification shows live state (elapsed time; optionally native distance for UI only).
- JS on native: **poll `getTrack(sinceIndex)`** every ~2s + on resume. Do **not** depend on live callbacks for the authoritative track.
- Cold launch: call `getActiveSession()` and re-attach if a run is active.
- Web path remains completely unchanged (browser geolocation).
- Source of truth for saved run on finish: the full persisted track (JS can still run `run-math` on it).
- iOS later (lower priority).

Acceptance criteria (from plan):
- Kill the app mid-run (swipe away) during screen-off walk → reopen → full track intact from disk.
- Samsung A51: 10-min screen-off ≥ ~8 pts/min, curved route, distance within ~15%.
- Battery sane.

## Current State (as of this skeleton)

### Location / Collection
- `src/lib/geo-watch.ts` + patched `@capacitor-community/background-geolocation` (v1.2.26).
- In-memory `locationBuffer` in the plugin's Java (added via patch).
- `drainBufferedLocations()` called on resume + 2s tick in `run-tracker.tsx`.
- Live `addWatcher` callback also delivers points.
- `startPositionWatch` chooses native vs web.
- Patch already has:
  - Some FGS + wake lock work.
  - Flight recorder (`gps-flightlog.jsonl`).
  - Comments noting "do NOT re-register on pause/resume".
  - Watchdog escalation to raw GPS (seen in logs).

**Gap vs Phase 2**: Still tied to the community plugin's watcher model. No per-run `runId` ownership. Buffer is in-memory (not disk). Collection not fully independent of the plugin lifecycle.

### Persistence & Recovery
- `src/lib/run-persist.ts` — localStorage key `runsemble-active-run`.
- Stores: `startedAt`, `elapsedSec`, `distanceKm`, `splits`, `routePoints`, `points[]`, context.
- Saved on every phase/routing change while running.
- Loaded on mount of `RunTracker` for crash recovery.
- Cleared on finish.

**Gap vs Phase 2**: localStorage (WebView-dependent). Not append-only per-run JSONL on disk. No native side writing the points. Duplicate data between memory + storage.

### Run Lifecycle & Ownership
- Runs do not have a `runId` at start in the native layer.
- `clientRunId` is generated in `run-tracker.tsx` (for offline queuing).
- On finish → compute everything in JS → `POST /api/runs`.
- No native `getActiveSession()` concept.

**Gap**: Native layer does not "own" a run. No way for a cold-launched native shell to re-attach a run without the WebView/JS being ready.

### JS Integration in run-tracker.tsx
- `useEffect` for `startPositionWatch`.
- Separate effect for `drainBufferedLocations()` on resume.
- `ingestPosition` does dedup by `t`, accuracy gate, distance math, splits.
- Live map + stats driven from the same points array.
- Long-press GPS chip → `getFlightLog()` (diagnostic only).

**Gap**: Heavy reliance on live callbacks + drain. Plan wants polling `getTrack(sinceIndex)` as the primary path for native.

### Notification & Foreground
- Handled inside the community plugin (`backgroundTitle` / `backgroundMessage`).
- Patch added some typed FGS work.

**Gap**: Not a fully controlled started service owned by our RunRecorder.

### Capacitor Wiring
- `capacitor.config.ts` has no custom plugins registered yet.
- Uses `registerPlugin('BackgroundGeolocation')`.

## Gap Summary Table

| Area                    | Current                                      | Phase 2 Spec                                      | Severity |
|-------------------------|----------------------------------------------|---------------------------------------------------|----------|
| Service type            | Bound + plugin-managed FGS                   | Explicit `startForegroundService` + `START_STICKY` | High    |
| Persistence             | localStorage (full snapshot) + in-mem buffer | Per-run append-only `runs/{runId}.jsonl` on disk | High    |
| Session ownership       | JS + localStorage                            | Native owns via `runId`, `getActiveSession()`    | High    |
| Data delivery to JS     | Live callbacks + drain buffer                | Polling `getTrack(sinceIndex)` (primary)         | Medium  |
| Survive app kill        | Partial (localStorage + buffer)              | Full (disk + sticky service)                     | High    |
| Plugin                  | Patched community one                        | New dedicated `RunRecorder` custom plugin        | Medium  |
| Web compatibility       | Good (separate path)                         | Must remain untouched                            | Low     |
| Notification            | Plugin-provided                              | RunRecorder-controlled (live elapsed etc.)       | Medium  |

## What the Skeleton Provides (this PR / changes)

1. `docs/phase2-run-recorder-gap-analysis.md` (this file)
2. `src/lib/run-recorder.ts` — clean TypeScript API + web stub + planned native registration.
3. `native/run-recorder/` — self-contained scaffold:
   - `README.md` (how to finish the plugin)
   - `src/definitions.ts`
   - Android Kotlin skeleton (`RunRecorderPlugin.java` + `RunRecorderService.java`)
4. Safe comments + example blocks in:
   - `run-tracker.tsx` (how the native branch would switch)
   - `capacitor.config.ts`
5. No runtime changes. Old tracking path untouched.

## Next Steps for Real Implementation (for Claude / later)

- Turn `native/run-recorder` into a real Capacitor plugin (or use local linking).
- Register it (capacitor.config or `registerPlugin`).
- Implement full location logic in the service (copy/adapt the good parts from the current patch: buffer style, raw fallback, flight ideas, but write to per-run JSONL).
- Wire `run-tracker.tsx` to prefer `run-recorder` on native when ready.
- On finish, read the JSONL (or have native return full track) and compute with existing `run-math`.
- Keep the community plugin for now (or migrate gradually).
- Add the one-time tracking check (Phase 3) on top.

## Notes for Reviewers (Claude)

- Everything is additive.
- No existing files were functionally changed.
- The Kotlin skeleton is deliberately close to the service code already proven in the patch + the explicit requirements in the plan.
- JSONL format is simple line-per-fix for easy append + recovery.
- `sinceIndex` is intended to allow efficient incremental polling (return only new points).

See the individual files for detailed comments and TODOs.

This skeleton is ready for review before any real integration or native build work.