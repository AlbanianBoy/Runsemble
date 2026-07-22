import { describe, it, expect } from 'vitest'
import { requireVerifiedEmail } from '@/lib/capabilities'

// The Sybil hole this closes: signing up cost an email address and nothing else,
// because emailVerified was written by the verify flow and read by nothing. A
// script could mint accounts as fast as it could invent addresses and every one
// of them could immediately DM strangers.

describe('requireVerifiedEmail', () => {
  it('lets a confirmed account through', () => {
    expect(requireVerifiedEmail({ emailVerified: true })).toBeNull()
  })

  it('refuses an unconfirmed one with 403 and a machine-readable code', async () => {
    const res = requireVerifiedEmail({ emailVerified: false })
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)

    const body = await res!.json()
    expect(body.code).toBe('email_unverified')
    // Its own code, not plain 'forbidden': the client's correct response is to
    // open the resend sheet, which is a different thing to do than showing a
    // toast, and it must not depend on matching the sentence.
    expect(body.code).not.toBe('forbidden')
  })

  it('names the way out in the human message', async () => {
    // A wall with no visible door reads as the app being broken.
    const body = await requireVerifiedEmail({ emailVerified: false })!.json()
    expect(body.error.toLowerCase()).toContain('code')
  })

  it('is not a 401 — the session is fine, the capability is not', async () => {
    // 401 would send the app to the login screen and lose the person's place,
    // for an account that is perfectly signed in.
    expect(requireVerifiedEmail({ emailVerified: false })!.status).not.toBe(401)
  })
})
