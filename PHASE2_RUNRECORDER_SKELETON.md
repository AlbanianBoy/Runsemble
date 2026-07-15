# Phase 2 RunRecorder Skeleton — Ready for Claude Review

**This is additive only. Nothing is wired or running yet.**

Created on 2026-07-14 for review.

## What was produced

- `docs/phase2-run-recorder-gap-analysis.md` — detailed current vs spec comparison
- `src/lib/run-recorder.ts` — clean TypeScript API matching the plan exactly
- `native/run-recorder/` — full skeleton:
  - README with implementation guidance
  - `src/definitions.ts`
  - Android `RunRecorderPlugin.java`
  - Android `RunRecorderService.java` (started FGS + START_STICKY + JSONL + HandlerThread + raw fallback sketch)
- Safe comments + example integration code in:
  - `capacitor.config.ts`
  - `src/components/runsemble/run-tracker.tsx`

## Key design choices in the skeleton

- Follows the plan 1:1 (started service, disk JSONL per runId, poll-based getTrack, native owns the session).
- Web path is explicitly untouched.
- Old patched community plugin + geo-watch path is left 100% functional.
- JSONL is append-only, one line per fix, contains the original `t` timestamp.
- Service uses a dedicated HandlerThread (important for reliability).
- Wake lock + typed FGS pattern taken from what was already working in the community plugin patch.

## For Claude

Please review:
1. Does the API in `run-recorder.ts` + `definitions.ts` match what the plan asked for?
2. Is the Android service skeleton on the right track (started + sticky + immediate disk append)?
3. Any missing pieces from the gap analysis?
4. Any risk in the proposed cutover comments in run-tracker.tsx?
5. Should we prefer `sinceIndex` or `sinceTimestamp` for the polling API?

When you're happy, we can:
- Turn the native folder into a real linked Capacitor plugin
- Implement the missing pieces in the service (full raw GNSS watchdog, notification updates, efficient getTrack, etc.)
- Wire a small feature flag in run-tracker
- Keep the old path as fallback during transition

**No commits or pushes were performed.** All files are untracked or have only comment additions.

You can safely delete the whole `native/run-recorder/` folder + the two new .md files + `src/lib/run-recorder.ts` if the direction is rejected.

Let's make the tracking rock solid.
