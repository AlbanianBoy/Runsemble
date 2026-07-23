// ─── Live-share, from the runner's side of the glass ─────────────────────────
// The small surface the run tracker calls so it doesn't grow another hundred
// lines of fetch plumbing. Everything here runs in the running phone's browser
// (or Capacitor webview); the watcher's side is the public /watch page, which
// talks to a different endpoint and shares none of this.

import { apiGet, apiSend } from '@/lib/api'
import type { RunShareSummary, RunShareResponse, RunShareBeaconResponse } from '@/lib/types'

/** The link a runner hands out. Built from the current origin so it is correct
 *  on localhost, the web app, and the native build alike. */
export function watchUrl(token: string): string {
  return `${window.location.origin}/watch/${token}`
}

/** The runner's current live share, or null. Used to pick a share back up if the
 *  tracker remounts mid-run. */
export async function getActiveShare(): Promise<RunShareSummary | null> {
  const res = await apiGet<RunShareResponse>('/api/run-shares')
  return res.share
}

/** Start sharing — or, if one is already live, get that same link back. One run,
 *  one link (the server enforces this; we just surface whichever it returns). */
export async function createShare(): Promise<RunShareSummary> {
  const res = await apiSend<RunShareResponse>('/api/run-shares', 'POST')
  if (!res.share) throw new Error('No share returned')
  return res.share
}

/** Stop sharing. Safe to call when nothing is live — the server answers 0 ended. */
export async function endShare(): Promise<void> {
  await apiSend('/api/run-shares', 'DELETE')
}

/**
 * Post one position (and optionally raise SOS). Returns how many shares it landed
 * on: 0 means the share is dead server-side and the caller should stop beaconing.
 */
export async function sendBeacon(input: {
  lat: number
  lng: number
  accuracyM: number | null
  distanceKm: number
  durationSec: number
  sos?: boolean
}): Promise<number> {
  const res = await apiSend<RunShareBeaconResponse>('/api/run-shares/beacon', 'POST', input)
  return res.active
}

/**
 * Hand the link to whoever the runner chooses, via the native share sheet when
 * it exists (it usually does in the Capacitor webview) and the clipboard
 * otherwise. The runner picks the recipient in the OS UI — this never names one.
 *
 * 'cancelled' is distinct from 'failed' on purpose: dismissing the share sheet
 * throws AbortError, and toasting "couldn't share" at someone who just changed
 * their mind is wrong. The caller stays silent on 'cancelled'.
 */
export async function shareLink(url: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title: 'Follow my run', text: 'Follow my run live on Runsemble:', url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Any other share failure falls through to the clipboard — a copied link
      // is still a link the runner can paste into a message.
    }
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url)
      return 'copied'
    } catch {
      return 'failed'
    }
  }

  return 'failed'
}
