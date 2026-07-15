# Phase 2 RunRecorder — Gap Analysis & Implementation Status

**Date:** 2026-07-15  
**Status:** ✅ Native implementation complete. Pending AndroidManifest wiring + run-tracker.tsx cutover.

---

## Phase 2 Spec (from `docs/tracking-endgame-plan.md`)

Key requirements:
- Custom local Capacitor plugin under `native/run-recorder/`
- Kotlin/Java foreground service using `startForegroundService` + `START_STICKY`
- Typed `FOREGROUND_SERVICE_TYPE_LOCATION` (API 29+)
- `PARTIAL_WAKE_LOCK` while active
- `HandlerThread` for location callbacks (not main thread)
- Watchdog raw GNSS fallback from Phase 1 learnings
- Owns the session via `runId`: `startTracking(runId)`, `stopTracking()`, `getActiveSession()`, `getTrack(runId, sinceIndex)`, `clearTrack(runId)`
- Disk-first persistence: every accepted fix appended immediately to `filesDir/runs/<runId>.jsonl`
- Survives WebView death, full app kill, low memory, etc.
- Notification shows live state (elapsed time)
- JS polls `getTrack(sinceIndex)` every 2s on resume
- Cold launch: call `getActiveSession()` and re-attach if a run is active
- Web path remains completely unchanged (browser Geolocation)
- Source of truth for saved run: the full persisted track
- iOS: later / lower priority

---

## Current State vs Spec

| Area | Before Phase 2 | Phase 2 (now) | Status |
|---|---|---|---|
| Service type | Bound, plugin-managed FGS | `startForegroundService` + `START_STICKY` | ✅ Done |
| Persistence | `localStorage` + in-mem buffer | Per-run append-only `runs/<runId>.jsonl` on disk | ✅ Done |
| Session ownership | JS `localStorage` | Native owns via `runId`, `getActiveSession()` | ✅ Done |
| Data delivery to JS | Live callbacks + drain buffer | Polling `getTrack(sinceIndex)` primary | ✅ Done |
| Survive app kill | Partial (`localStorage` + buffer) | Full disk + sticky service | ✅ Done |
| Plugin | Patched community one | New dedicated `RunRecorder` custom plugin | ✅ Done |
| Web compatibility | Good, separate path | Untouched | ✅ Done |
| Notification | Plugin-provided | RunRecorder-controlled, live elapsed | ✅ Done |
| Raw GNSS watchdog | In patch | In service (30s starvation threshold) | ✅ Done |
| AndroidManifest | Not declared | **TODO: add service + permissions** | ⏳ Pending |
| run-tracker.tsx cutover | Old path | **TODO: native branch switch** | ⏳ Pending |
| iOS | Not applicable | Later / lower priority | ⏳ Future |

---

## Remaining Steps to Go Live

### 1. AndroidManifest.xml
Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<service
    android:name="net.runsemble.runrecorder.RunRecorderService"
    android:foregroundServiceType="location"
    android:exported="false" />

<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### 2. Gradle source set
Ensure `native/run-recorder/android` is on the Java sourcePath in
`android/app/build.gradle`, or copy the two `.java` files into
`android/app/src/main/java/net/runsemble/runrecorder/`.

### 3. run-tracker.tsx — native branch
On start:
```ts
if (isRunRecorderSupported()) {
  await runRecorder.startTracking({ runId: clientRunId });
  // replace the drain tick with getTrack polling
} else {
  startPositionWatch(); // existing web path
}
```
On cold launch:
```ts
const { runId } = await runRecorder.getActiveSession();
if (runId) { /* re-attach UI from getTrack */ }
```
On finish:
```ts
const { points } = await runRecorder.getTrack({ runId: clientRunId, sinceIndex: 0 });
// feed points through existing run-math.ts → POST api/runs as before
await runRecorder.clearTrack({ runId: clientRunId });
```

---

## Acceptance Criteria (unchanged from spec)

- Kill app mid-run → swipe away during screen-off walk → reopen → full track intact from disk
- Samsung A51: 10-min screen-off → ≥8 pts/min, curved route, distance within 15%
- App force-killed by OEM → same result as swipe
- Battery sane (wake lock released on `stopTracking`)
