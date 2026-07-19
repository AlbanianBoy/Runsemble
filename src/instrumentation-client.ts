import * as Sentry from '@sentry/nextjs'

// ─── Error tracking (browser) ─────────────────────────────────────────────────
// Next loads this file natively (no Sentry build wrapper needed). Inert until
// NEXT_PUBLIC_SENTRY_DSN is set.
//
// Session replay is explicitly OFF. This is a location app; recording a user's
// screen is exactly the kind of data we don't want to hold. Errors and traces
// are enough.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

// Ties client-side navigations to Sentry traces. No-op when Sentry isn't init'd.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
