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
        'Pooled host without ?pgbouncer=true — Prisma will keep using prepared statements, which ' +
          'PgBouncer in transaction mode cannot support. Expect intermittent query errors.'
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

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? null,
    environment: process.env.VERCEL_ENV ?? 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    database: { ...database, reachable, latencyMs },
    // Which third parties this instance believes it can reach. Booleans only —
    // a key's presence is the useful fact, its value never is.
    integrations: {
      sentry: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      posthog: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
      resend: Boolean(process.env.RESEND_API_KEY),
      fcm: Boolean(process.env.FCM_PRIVATE_KEY),
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      cronSecret: Boolean(process.env.CRON_SECRET),
      adminEmails: Boolean(process.env.ADMIN_EMAILS),
    },
    warnings,
  })
}
