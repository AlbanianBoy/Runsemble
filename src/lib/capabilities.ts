// ─── What an account is allowed to do ─────────────────────────────────────────
// Signing up costs an email address and nothing else. Nobody has to click the
// code we send — emailVerified was written by the verify flow and read by
// literally nothing, so it was a decoration on the profile rather than a
// control. That is the Sybil hole (M17): a script can mint accounts as fast as
// it can invent addresses, and every one of them can immediately DM strangers.
//
// The line drawn here is deliberate, and it is not "verified users only".
//
//   Anyone signed in can:  look at the map, see who's free, join a run, track a
//                          run, earn XP. Everything the app is FOR.
//   Verification is for:   reaching another person — DMs, run invites, posts,
//                          comments.
//
// Putting the wall in front of the map instead would trade a real activation
// cost for very little: someone browsing runs harms nobody, and making a new
// runner wait on an email before they can see whether the app has anything near
// them is how you lose them. The abuse all lives on the far side of "this
// arrives in someone else's notifications", so that is where the check goes.
//
// It also composes with the rate limits rather than duplicating them: limits
// bound how fast one account can act, this bounds how cheaply accounts can be
// created in the first place. Neither is much use alone.

import type { NextResponse } from 'next/server'
import { apiError } from './http'

interface VerifiableUser {
  emailVerified: boolean
}

/**
 * Refuse an action that reaches other people when the account has not confirmed
 * its address. Returns a response to hand straight back, or null to continue.
 *
 * The message names the way out, because a wall with no door reads as a bug —
 * and the client keys on the `email_unverified` code to offer a resend button
 * rather than matching this sentence.
 */
export function requireVerifiedEmail(user: VerifiableUser): NextResponse | null {
  if (user.emailVerified) return null
  return apiError(
    403,
    'email_unverified',
    'Confirm your email address first — we sent you a code when you signed up'
  )
}
