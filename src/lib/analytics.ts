'use client'

// ─── Product analytics ────────────────────────────────────────────────────────
// The point is to stop flying blind — to be able to answer "does anyone finish a
// run?" and "where does onboarding lose people?" without being the only user.
//
// Inert until keyed, the same way blob storage is: with no NEXT_PUBLIC_POSTHOG_KEY
// the SDK never initialises, so there's no network, no cost, and every call below
// is a no-op. Add the key and it lights up. This ships safe before an account
// exists.
//
// Two deliberate privacy choices, because this app holds location data:
//   - autocapture OFF: no blanket DOM/click capture. We send named events only,
//     so we always know exactly what leaves the device.
//   - EU host by default: keep the data in-region for GDPR.

import posthog from 'posthog-js'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

let ready = false

export function initAnalytics(): void {
  if (ready || !KEY || typeof window === 'undefined') return
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false, // it's an SPA; we send meaningful events ourselves
    persistence: 'localStorage',
    person_profiles: 'identified_only',
  })
  ready = true
}

/**
 * Turn analytics on or off to match the user's consent. Analytics is a separate
 * purpose from the core service, so it stays off until the user opts in, and it
 * must stop the moment they withdraw (Art. 7(3)). Called with the stored
 * preference on load and whenever the user flips the toggle.
 */
export function setAnalyticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || !KEY) return
  if (enabled) {
    initAnalytics()
    if (ready) posthog.opt_in_capturing()
  } else if (ready) {
    // Stop sending and forget the current person; nothing further leaves the
    // device until consent is given again.
    posthog.opt_out_capturing()
    posthog.reset()
  }
}

/** Tie events to a signed-in user. Safe to call repeatedly. */
export function identifyUser(id: string): void {
  if (!ready) return
  posthog.identify(id)
}

/** Named event with optional properties. No-op until analytics is configured. */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (!ready) return
  posthog.capture(event, props)
}

/** On sign-out, so the next user on this device isn't merged into the last one. */
export function resetAnalytics(): void {
  if (!ready) return
  posthog.reset()
}

// A closed set, so event names can't drift into typos that silently split a
// funnel. Add here first, then emit.
export type AnalyticsEvent =
  | 'account_created'
  | 'onboarding_profile_saved'
  | 'onboarding_skipped'
  | 'run_saved'
  | 'went_available'
  | 'report_filed'
