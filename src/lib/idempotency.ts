// ─── Idempotent writes ────────────────────────────────────────────────────────
// A phone on a train sends a message. The request reaches the server, the row is
// written, and the response never makes it back. The app shows a failure, the
// person taps send again, and now there are two.
//
// /api/runs has been immune to this since offline sync landed: the device
// generates an id for the run it recorded, the column is unique per user, and a
// re-POST returns the run already stored rather than banking a second one. The
// audit's point (M3) was that the pattern stopped there, while DMs, posts and
// comments — the writes people make most, on the worst connections — had none.
//
// The id identifies WHAT THE PERSON COMPOSED, not the attempt. It's generated
// once when the text is written and reused for every retry, so any number of
// attempts collapse onto one row. Generating a fresh one per attempt would
// defeat the whole thing.
//
// Deliberately not a generic idempotency-key table with stored response bodies.
// Each of these writes produces exactly one row, so the row IS the response —
// which means no snapshot to go stale, and no expiry job to forget to run.

import { newClientId } from './client-id'

export { newClientId }

/** Longest client id accepted. cuid/uuid are well under this. */
const MAX_CLIENT_ID = 64

/**
 * Read a client-supplied idempotency id off a request body.
 *
 * Returns null when absent or unusable, and null means "no idempotency" rather
 * than an error: an older app build that doesn't send one must keep working,
 * and the failure mode without it (a possible duplicate) is milder than
 * refusing the write outright.
 */
export function readClientId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_CLIENT_ID) return null
  return trimmed
}
