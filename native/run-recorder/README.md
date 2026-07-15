# RunRecorder — Phase 2 Native Run Tracking Plugin

Custom Capacitor plugin that owns run tracking at the native layer.

## Status
**Real implementation** — service is complete and ready to wire in.

The existing `geo-watch.ts` + patched community `background-geolocation` path
continues to work **100% unchanged** until the cutover commit lands in
`run-tracker.tsx`.

## Why this exists

Even after the Phase 1 patches the current approach:
- Depends on the WebView being alive enough to drain in-memory buffers
- Persists recovery state to `localStorage` (WebView-dependent)
- Has no native-owned run session — cold relaunch needs JS to be ready

Phase 2 goal:
- A **started** foreground service (`START_STICKY`) that owns runs by `runId`
- Every fix written to disk **immediately** as append-only JSONL
- JS polls `getTrack(runId, sinceIndex)` — disk is the source of truth
- Survives app kill, screen-off, aggressive OEMs
- Web path untouched

## Directory layout

```
native/run-recorder/
  README.md                   ← this file
  src/
    definitions.ts            ← TypeScript interface
  android/src/main/java/net/runsemble/runrecorder/
    RunRecorderPlugin.java    ← Capacitor bridge
    RunRecorderService.java   ← Foreground service (the real work)
```

## How to wire it in

### 1. Register the plugin in `capacitor.config.ts`

```ts
import { RunRecorder } from './native/run-recorder/src/definitions';
// add to plugins section or use registerPlugin in run-recorder.ts
```

### 2. Declare the service in `android/app/src/main/AndroidManifest.xml`

```xml
<service
    android:name="net.runsemble.runrecorder.RunRecorderService"
    android:foregroundServiceType="location"
    android:exported="false" />
```

Also ensure these permissions are present:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### 3. Add the Java files to the Android build

Link the `native/run-recorder/android` source into the Gradle build, or copy
the two `.java` files into `android/app/src/main/java/net/runsemble/runrecorder/`
directly for a faster first iteration.

### 4. Switch `run-tracker.tsx` to the native branch

See integration notes in `src/lib/run-recorder.ts`. The switch is a feature-flag
one-liner: replace the `startPositionWatch` call with `runRecorder.startTracking`
when `isRunRecorderSupported()` returns true.

## JSONL format

```json
{"t":1720981234567,"lat":51.2123,"lng":4.4123,"acc":5.2,"provider":"fused"}
{"t":1720981235601,"lat":51.2124,"lng":4.4124,"acc":4.8,"provider":"fused"}
```

One line per fix. Files live at `filesDir/runs/<runId>.jsonl`.

## Acceptance criteria

- Swipe app away mid-run, wait 2+ min, reopen → full route intact, no gap
- Samsung A51: 10-min screen-off walk → ≥8 pts/min, curved route, distance within 15%
- App force-killed by OEM → same result as swipe
- Battery usage sane (wake lock released on stop)
