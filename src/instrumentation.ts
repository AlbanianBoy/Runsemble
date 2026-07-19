import * as Sentry from '@sentry/nextjs'

// ─── Error tracking (server + edge) ───────────────────────────────────────────
// Inert until NEXT_PUBLIC_SENTRY_DSN is set — with no DSN, init never runs and
// captureRequestError is a no-op, so this ships safe before a Sentry project
// exists and the build is unaffected. Add the DSN to start seeing production
// errors instead of hearing about them from a user.
//
// Deliberately without withSentryConfig: that wrapper exists to upload source
// maps, which needs an auth token and touches the Turbopack build. Basic error
// capture doesn't need it. Source maps are a follow-up, not a blocker.

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      // 10% of transactions is plenty at this scale, and keeps the free tier free.
      tracesSampleRate: 0.1,
    })
  }
}

// Reports errors thrown in server components / route handlers to Sentry.
export const onRequestError = Sentry.captureRequestError
