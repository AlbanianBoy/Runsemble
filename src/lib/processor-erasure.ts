// ─── Erasure that reaches the processors (GDPR Art. 17(2)) ────────────────────
// Deleting the account wipes our database and our blob storage. That is not the
// whole obligation: anywhere else that holds data identified to the person has
// to be told too, and until now nothing was.
//
// Who actually holds identified data, checked rather than assumed:
//
//   PostHog   — yes. analytics.ts calls posthog.identify(user.id), so the
//               Person profile and its event history are keyed to our user id.
//               This is the one that needs an API call.
//   Sentry    — no. Nothing in the app calls Sentry.setUser, so events carry no
//               app user id. (Sentry still receives IP addresses by default,
//               which is a separate retention question, not an erasure target
//               keyed to a person we can name.)
//   Resend    — transactional only. It holds delivery logs for the address, not
//               a profile keyed to our id; the address itself is gone from our
//               side once the row is deleted.
//   Vercel Blob — already handled: the delete route collects post images and
//               removes them before the rows that know their URLs disappear.
//
// Inert until keyed, like the rate limiter: without a personal API key this
// returns 'not-configured' and says so in the log, rather than pretending. The
// diagnostics endpoint reports the same, so "is erasure actually complete" is a
// question with an answer instead of an assumption.
//
// Needs POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID. Note this is a
// PERSONAL api key (server-side, secret), not the NEXT_PUBLIC_POSTHOG_KEY that
// the browser uses to send events — that one cannot delete anything.

export type ProcessorErasureResult =
  | { processor: 'posthog'; status: 'deleted' | 'not-found' | 'not-configured' | 'failed'; detail?: string }

/**
 * PostHog's API host, derived from the ingestion host the app already
 * configures. Ingestion is `eu.i.posthog.com`; the API lives on `eu.posthog.com`
 * — the `i.` subdomain only accepts events, so calling it here would 404 in a
 * way that looks like the person simply wasn't found.
 */
function posthogApiHost(): string {
  const ingest = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'
  return ingest.replace('//eu.i.', '//eu.').replace('//us.i.', '//us.').replace(/\/$/, '')
}

async function erasePosthogPerson(userId: string): Promise<ProcessorErasureResult> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY
  const project = process.env.POSTHOG_PROJECT_ID
  if (!key || !project) {
    return { processor: 'posthog', status: 'not-configured' }
  }

  const host = posthogApiHost()
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  try {
    // The delete endpoint wants PostHog's own numeric person id, so the distinct
    // id we know them by has to be resolved first.
    const lookup = await fetch(
      `${host}/api/projects/${project}/persons/?distinct_id=${encodeURIComponent(userId)}`,
      { headers, cache: 'no-store' }
    )
    if (!lookup.ok) {
      return { processor: 'posthog', status: 'failed', detail: `lookup returned ${lookup.status}` }
    }

    const found = (await lookup.json()) as { results?: Array<{ id: number | string }> }
    const person = found.results?.[0]
    // Nothing to erase is a success, not a failure: someone who never consented
    // to analytics was never sent, so no profile was ever created.
    if (!person) return { processor: 'posthog', status: 'not-found' }

    // delete_events=true is the point. Removing the Person while leaving their
    // events behind would leave the behavioural record intact under a detached
    // distinct id, which is not erasure.
    const del = await fetch(
      `${host}/api/projects/${project}/persons/${person.id}/?delete_events=true`,
      { method: 'DELETE', headers, cache: 'no-store' }
    )
    if (!del.ok && del.status !== 404) {
      return { processor: 'posthog', status: 'failed', detail: `delete returned ${del.status}` }
    }
    return { processor: 'posthog', status: 'deleted' }
  } catch (error) {
    return {
      processor: 'posthog',
      status: 'failed',
      detail: error instanceof Error ? error.message : 'unknown error',
    }
  }
}

/**
 * Ask every processor holding identified data to erase this person.
 *
 * Never throws. The account row is already gone by the time this runs, and
 * failing the delete response because a third party was unreachable would leave
 * the user believing their account still exists when it does not. Anything that
 * did not succeed is logged loudly enough to act on — that log is the record
 * that a manual follow-up is owed.
 */
export async function eraseFromProcessors(userId: string): Promise<ProcessorErasureResult[]> {
  const results = [await erasePosthogPerson(userId)]

  for (const r of results) {
    if (r.status === 'deleted' || r.status === 'not-found') continue
    console.error(
      `[erasure] ${r.processor}: ${r.status}${r.detail ? ` — ${r.detail}` : ''}. ` +
        `User ${userId} is deleted here but may still exist there; this needs doing by hand.`
    )
  }
  return results
}

/** Whether processor erasure can actually run on this instance. */
export function processorErasureConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID)
}
