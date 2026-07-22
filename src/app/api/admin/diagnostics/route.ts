// GET /api/admin/diagnostics — what the running instance is actually connected
// to. Admin-only.
//
// This exists because the single highest-severity finding in the architecture
// audit — "Vercel serverless connects to Neon's DIRECT (unpooled) endpoint,
// connection exhaustion is the first hard wall" — turned out to be unanswerable
// from outside. DATABASE_URL is marked sensitive in Vercel, so `vercel env pull`
// returns it blank and `vercel env ls` shows only "Encrypted". The value is
// knowable only from inside a running instance, and only the instance can tell
// you which endpoint it actually dialled rather than which one someone believes
// they configured.
//
// So: ask the process. Every serverless function that opens a connection knows
// this, and now it can say so.
//
// NOTHING SECRET IS RETURNED. The connection string is parsed and thrown away;
// what comes back is the host with its identifying prefix removed, plus
// booleans. Enough to answer "are we pooled, in the right region, with the right
// flags" and not enough to connect to anything.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminUser } from '@/lib/admin'
import { isBlobConfigured } from '@/lib/image-store'
import { rateLimitBackend } from '@/lib/rate-limit'
import { processorErasureConfigured } from '@/lib/processor-erasure'

export const dynamic = 'force-dynamic'

interface DbTopology {
  configured: boolean
  /** Neon's pooled endpoint hosts carry a "-pooler" suffix on the endpoint id. */
  pooled: boolean
  /** Host with the endpoint id redacted: "***.c-4.eu-central-1.aws.neon.tech". */
  hostSuffix: string | null
  region: string | null
  sslmode: string | null
  /** pgbouncer=true tells Prisma to disable prepared statements, which a pooler requires. */
  pgbouncerFlag: boolean
  connectionLimit: string | null
  /** Set when migrations should bypass the pooler. Absent is fine if you migrate from a laptop. */
  hasDirectUrl: boolean
}

function describeDatabaseUrl(raw: string | undefined): DbTopology {
  if (!raw) {
    return {
      configured: false,
      pooled: false,
      hostSuffix: null,
      region: null,
      sslmode: null,
      pgbouncerFlag: false,
      connectionLimit: null,
      hasDirectUrl: Boolean(process.env.DIRECT_URL),
    }
  }

  let host = ''
  let params = new URLSearchParams()
  try {
    const u = new URL(raw)
    host = u.hostname
    params = u.searchParams
  } catch {
    // A malformed URL is itself worth reporting rather than throwing — the
    // instance is running, so something parsed it, and we'd rather say
    // "configured but unreadable" than 500 the diagnostic.
  }

  // "ep-fancy-rice-a1b2c3-pooler.c-4.eu-central-1.aws.neon.tech" — the endpoint
  // id is the only identifying part, so it's the part we drop.
  const [, ...rest] = host.split('.')
  const parts = host.split('.')

  return {
    configured: true,
    pooled: /-pooler(\.|$)/.test(host),
    hostSuffix: host ? `***.${rest.join('.')}` : null,
    // ...aws.neon.tech → the region sits third from the right for Neon hosts.
    region: parts.length >= 4 ? parts[parts.length - 4] ?? null : null,
    sslmode: params.get('sslmode'),
    pgbouncerFlag: params.get('pgbouncer') === 'true',
    connectionLimit: params.get('connection_limit'),
    hasDirectUrl: Boolean(process.env.DIRECT_URL),
  }
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const database = describeDatabaseUrl(process.env.DATABASE_URL)

  // A round trip proves the connection works, and the elapsed time is a rough
  // read on whether we're dialling across a region boundary.
  let reachable = false
  let latencyMs: number | null = null
  const startedAt = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    reachable = true
    latencyMs = Date.now() - startedAt
  } catch {
    reachable = false
  }

  // Say what's wrong in words, so this doesn't need an audit report open beside
  // it to interpret. Empty means everything checked out.
  const warnings: string[] = []
  if (!database.configured) {
    warnings.push('DATABASE_URL is not set on this instance.')
  } else {
    if (!database.pooled) {
      warnings.push(
        'Serverless is connected to the DIRECT Neon endpoint. Every function invocation opens its own ' +
          'connection, so a traffic spike exhausts the database long before it troubles the app. ' +
          'Switch DATABASE_URL to the "-pooler" host and redeploy.'
      )
    }
    if (database.pooled && !database.pgbouncerFlag) {
      warnings.push(
        'Pooled host without ?pgbouncer=true. Prisma documents that flag for poolers in transaction ' +
          'mode, where it stops Prisma using prepared statements. Neon’s pooler has supported ' +
          'prepared statements since PgBouncer 1.22, so this may well be fine — the way to know is ' +
          'Sentry: if there are no "prepared statement already exists" errors, leave it alone. Adding ' +
          'the flag is the safe move if any appear.'
      )
    }
    if (database.sslmode !== 'require') {
      warnings.push('DATABASE_URL does not set sslmode=require.')
    }
    if (!database.hasDirectUrl) {
      warnings.push(
        'No DIRECT_URL set. Fine while migrations run from a laptop; needed if they ever run from CI, ' +
          'because a pooled connection cannot take the advisory lock migrations use.'
      )
    }
  }
  if (!reachable) warnings.push('The database did not answer a SELECT 1.')
  if (rateLimitBackend() === 'in-memory') {
    warnings.push(
      'Rate limiting is in-memory, so each serverless instance counts separately and the limits are ' +
        'not enforceable. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or the KV_REST_API_* ' +
        'pair) and redeploy — no code change needed.'
    )
  }
  if (!processorErasureConfigured()) {
    warnings.push(
      'Account deletion does not reach PostHog. The database and blob storage are wiped, but the ' +
        'analytics Person profile and its events survive, which leaves Art. 17(2) unmet. Set ' +
        'POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID, or delete those by hand on each request.'
    )
  }
  if (!process.env.LOCATION_SALT) {
    warnings.push(
      'LOCATION_SALT is not set, so each map cell is offset by an amount derived from a public ' +
        'user id — recomputable by anyone who reads the code. Set it and redeploy.'
    )
  }

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? null,
    environment: process.env.VERCEL_ENV ?? 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    database: { ...database, reachable, latencyMs },
    // 'in-memory' means the limiter is per-instance and effectively decorative
    // on serverless — see the warning below.
    rateLimit: rateLimitBackend(),
    // Which third parties this instance believes it can reach. Booleans only —
    // a key's presence is the useful fact, its value never is.
    integrations: {
      sentry: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      posthog: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
      resend: Boolean(process.env.RESEND_API_KEY),
      fcm: Boolean(process.env.FCM_PRIVATE_KEY),
      // Ask the module that actually decides, rather than re-deriving it here.
      // This checked BLOB_READ_WRITE_TOKEN alone and reported false on a
      // production instance where uploads work fine — the store is connected via
      // BLOBB_STORE_ID and OIDC. A diagnostic that invents its own version of a
      // rule will eventually disagree with the code, and be believed.
      blob: isBlobConfigured(),
      cronSecret: Boolean(process.env.CRON_SECRET),
      adminEmails: Boolean(process.env.ADMIN_EMAILS),
      // Not an integration, but the same question: is it actually set on the
      // instance that's serving? Without it the per-user location grid falls
      // back to an offset derived from public user ids.
      locationSalt: Boolean(process.env.LOCATION_SALT),
      processorErasure: processorErasureConfigured(),
    },
    warnings,
  })
}
