import { describe, it, expect } from 'vitest'
import {
  newShareToken,
  shareStatus,
  positionVisible,
  firstName,
  toPublicRunShare,
  SHARE_TTL_MS,
  STALE_AFTER_MS,
  type ShareLifecycle,
  type ShareStatus,
  type PublicRunShareRow,
} from '@/lib/run-share'

// ─── Live run sharing ────────────────────────────────────────────────────────
// Both failure directions are bad, and they are not symmetric. Show a position
// on a link that is over, and someone is tracked after they said stop. Fail to
// show one on a link that is merely quiet, and the person watching is told the
// run ended when it did not — which is the failure that makes someone call the
// police. So the lifecycle and the position gate get pinned from both sides.
//
// Every assertion uses an explicit `now`; the real clock never decides a test.

const T0 = new Date('2026-07-22T21:00:00.000Z').getTime()

function lifecycle(over: Partial<ShareLifecycle> = {}): ShareLifecycle {
  return {
    expiresAt: new Date(T0 + SHARE_TTL_MS),
    endedAt: null,
    revokedAt: null,
    lastPingAt: new Date(T0),
    ...over,
  }
}

describe('newShareToken (the URL is the credential)', () => {
  it('mints 32 bytes in a URL-safe alphabet with no padding', () => {
    // 43 chars is base64url of exactly 32 bytes. If this ever shortens, the
    // token got smaller and a watch link became something worth guessing.
    const token = newShareToken()
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('survives being pasted into a URL untouched', () => {
    // base64url exists so nothing needs percent-encoding; a token that changes
    // shape between minting and the address bar simply never matches a row.
    const token = newShareToken()
    expect(encodeURIComponent(token)).toBe(token)
  })

  it('never repeats across many draws', () => {
    const drawn = new Set(Array.from({ length: 2000 }, () => newShareToken()))
    expect(drawn.size).toBe(2000)
  })
})

describe('shareStatus', () => {
  it('is live while fixes are still arriving', () => {
    expect(shareStatus(lifecycle(), T0 + 20_000)).toBe('live')
  })

  it('is stale once the last fix is older than the stale window', () => {
    expect(shareStatus(lifecycle(), T0 + STALE_AFTER_MS + 1)).toBe('stale')
  })

  it('is still live at exactly the stale boundary', () => {
    // The boundary is inclusive on the live side deliberately. With a 20s beacon
    // an off-by-one here flips a watcher into a "signal lost" warning on the dot
    // every three minutes, and a warning that cries wolf gets ignored.
    expect(shareStatus(lifecycle(), T0 + STALE_AFTER_MS)).toBe('live')
  })

  it('is stale, not live, for a share that has never pinged', () => {
    // Minted the instant the runner tapped Share, before the first GPS fix. It
    // has no position at all, so calling it live would render an empty map
    // under a green "live" badge.
    expect(shareStatus(lifecycle({ lastPingAt: null }), T0)).toBe('stale')
  })

  it('is expired the moment the four-hour cap is reached', () => {
    // A fix that is fresh at the boundary, so the only thing changing across it
    // is the expiry clock — otherwise the 4h-old default ping would (correctly)
    // read stale and hide whether expiry fired at all. This also pins that
    // 'expired' takes precedence over a live fix: at the cap it is expired even
    // though a fix landed a millisecond ago.
    const fresh = lifecycle({ lastPingAt: new Date(T0 + SHARE_TTL_MS - 1) })
    expect(shareStatus(fresh, T0 + SHARE_TTL_MS)).toBe('expired')
    expect(shareStatus(fresh, T0 + SHARE_TTL_MS - 1)).toBe('live')
  })

  it('is ended once the run has been saved', () => {
    expect(shareStatus(lifecycle({ endedAt: new Date(T0 + 60_000) }), T0 + 61_000)).toBe('ended')
  })

  it('is revoked even when the run also ended', () => {
    // Precedence, top of the order. The runner pulling the link is the most
    // specific thing that happened to it and the one the watcher is told.
    const row = lifecycle({ endedAt: new Date(T0 + 10_000), revokedAt: new Date(T0 + 10_000) })
    expect(shareStatus(row, T0 + 20_000)).toBe('revoked')
  })

  it('is revoked even long after it would also have expired', () => {
    const row = lifecycle({ revokedAt: new Date(T0 + 60_000) })
    expect(shareStatus(row, T0 + SHARE_TTL_MS + 60_000)).toBe('revoked')
  })

  it('is ended rather than expired when both are true', () => {
    // "Expired" reads as something that happened to the link; "ended" reads as
    // the run finishing normally, which is what actually occurred.
    const row = lifecycle({ endedAt: new Date(T0 + 60_000) })
    expect(shareStatus(row, T0 + SHARE_TTL_MS + 1)).toBe('ended')
  })

  it('prefers ended over a perfectly fresh ping', () => {
    // A last beacon racing the save must not resurrect a finished share.
    const row = lifecycle({ endedAt: new Date(T0), lastPingAt: new Date(T0 + 1_000) })
    expect(shareStatus(row, T0 + 1_000)).toBe('ended')
  })
})

describe('positionVisible', () => {
  it('shows coordinates while live and while stale', () => {
    expect(positionVisible('live')).toBe(true)
    // The whole reason 'stale' exists: the last known position stays on screen.
    expect(positionVisible('stale')).toBe(true)
  })

  it('shows nothing once the link is over, however it ended', () => {
    const over: ShareStatus[] = ['ended', 'expired', 'revoked']
    for (const status of over) expect(positionVisible(status)).toBe(false)
  })
})

describe('firstName', () => {
  it('takes the first word of a full name', () => {
    expect(firstName('Maya Okonkwo')).toBe('Maya')
  })

  it('returns a single-word name unchanged', () => {
    expect(firstName('Maya')).toBe('Maya')
  })

  it('copes with padding and double spaces', () => {
    expect(firstName('  Maya   Okonkwo ')).toBe('Maya')
  })

  it('falls back to the input when there is no word to take', () => {
    // A blank display name must not crash a public page or render "undefined".
    expect(firstName('')).toBe('')
    expect(firstName('   ')).toBe('   ')
  })
})

// ─── The payload is where the promise is kept ────────────────────────────────

const ROW: PublicRunShareRow = {
  ...lifecycle(),
  sosAt: null,
  lat: 51.21234,
  lng: 4.41987,
  accuracyM: 8,
  distanceKm: 4.2,
  durationSec: 1_500,
  createdAt: new Date(T0),
  user: { name: 'Maya Okonkwo', avatar: '/avatars/maya.png' },
}

describe('toPublicRunShare', () => {
  it('gives the watcher the exact position, not a privacy-grid cell', () => {
    // Deliberate, and the one place in the product where this is true: the
    // safe-zone and ~200m fuzzing applied to every other published coordinate
    // are NOT applied here, because a contact sent to a blurred cell cannot
    // find anybody. If this ever starts rounding, the feature is decorative.
    const out = toPublicRunShare(ROW, T0 + 20_000)
    expect(out.position).toEqual({
      lat: 51.21234,
      lng: 4.41987,
      accuracyM: 8,
      at: new Date(T0).toISOString(),
    })
  })

  it('keeps the last known position, and its age, while stale', () => {
    const out = toPublicRunShare(ROW, T0 + STALE_AFTER_MS + 30_000)
    expect(out.status).toBe('stale')
    expect(out.position?.lat).toBe(51.21234)
    expect(out.position?.at).toBe(new Date(T0).toISOString())
  })

  it('withholds the position on every status where the link is over', () => {
    const dead: PublicRunShareRow[] = [
      { ...ROW, endedAt: new Date(T0 + 60_000) },
      { ...ROW, revokedAt: new Date(T0 + 60_000) },
      { ...ROW, expiresAt: new Date(T0 - 1) },
    ]
    for (const row of dead) {
      const out = toPublicRunShare(row, T0 + 120_000)
      expect(positionVisible(out.status)).toBe(false)
      expect(out.position).toBeNull()
    }
  })

  it('withholds the position when there is no fix yet, rather than sending zeroes', () => {
    // Zeroed coordinates would place the runner in the Gulf of Guinea and look
    // like a real fix. Absent has to mean absent.
    const out = toPublicRunShare({ ...ROW, lat: null, lng: null, lastPingAt: null }, T0)
    expect(out.position).toBeNull()
    expect(JSON.stringify(out)).not.toContain('"lat"')
  })

  it('withholds the position when only one coordinate survived', () => {
    const out = toPublicRunShare({ ...ROW, lng: null }, T0)
    expect(out.position).toBeNull()
  })

  it('names the runner by first name only', () => {
    const out = toPublicRunShare(ROW, T0)
    expect(out.runner).toEqual({ name: 'Maya', avatar: '/avatars/maya.png' })
  })

  it('carries no user id, email, city or surname whatever the row holds', () => {
    // The link gets forwarded — that is how messengers work. Anything not in
    // this payload cannot be leaked by forwarding it, so the shape is the
    // boundary and this test is the guard on it.
    const leaky = {
      ...ROW,
      user: {
        id: 'usr_c0ffee',
        name: 'Maya Okonkwo',
        email: 'maya@example.com',
        avatar: null,
        city: 'Antwerp',
      },
    }
    const json = JSON.stringify(toPublicRunShare(leaky, T0))
    expect(json).not.toContain('usr_c0ffee')
    expect(json).not.toContain('maya@example.com')
    expect(json).not.toContain('Okonkwo')
    expect(json).not.toContain('Antwerp')
    expect(Object.keys(toPublicRunShare(leaky, T0).runner).sort()).toEqual(['avatar', 'name'])
  })

  it('reports no alarm by default', () => {
    const out = toPublicRunShare(ROW, T0)
    expect(out.sos).toBe(false)
    expect(out.sosAt).toBeNull()
  })

  it('raises the alarm flag and says when it was raised', () => {
    const raised = new Date(T0 + 300_000)
    const out = toPublicRunShare({ ...ROW, sosAt: raised }, T0 + 320_000)
    expect(out.sos).toBe(true)
    expect(out.sosAt).toBe(raised.toISOString())
  })

  it('still reports the alarm after the run has ended', () => {
    // A contact who opens the link two minutes late must not find a calm page.
    const out = toPublicRunShare(
      { ...ROW, sosAt: new Date(T0 + 60_000), endedAt: new Date(T0 + 90_000) },
      T0 + 120_000
    )
    expect(out.status).toBe('ended')
    expect(out.sos).toBe(true)
  })

  it('passes distance, duration and the two timestamps through as ISO strings', () => {
    const out = toPublicRunShare(ROW, T0)
    expect(out.distanceKm).toBe(4.2)
    expect(out.durationSec).toBe(1_500)
    expect(out.startedAt).toBe(new Date(T0).toISOString())
    expect(out.expiresAt).toBe(new Date(T0 + SHARE_TTL_MS).toISOString())
  })

  it('dates a position from the share start if a row has coordinates but no ping', () => {
    // Should not happen — they are written in one update — but a position with
    // no age renders as "NaN minutes ago", and this page is read while worried.
    const out = toPublicRunShare({ ...ROW, lastPingAt: null }, T0 + 1_000)
    expect(out.position?.at).toBe(new Date(T0).toISOString())
  })
})
