// ─── Rate limiting (distributed) ─────────────────────────────────────────────
// Uses Upstash Redis for a shared counter that works across all Vercel instances.
// Falls back to the old in-memory implementation when the env vars are absent
// (local dev, CI) so nothing breaks without Redis configured.
//
// Required env vars (add to Vercel project settings + .env.local):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// Get them from: https://console.upstash.com → create a Redis database → REST API
//
// The @upstash/redis package must be added:
//   pnpm add @upstash/redis

let upstashRedis: {
  incr: (key: string) => Promise<number>
  expire: (key: string, seconds: number) => Promise<number>
} | null = null

// Lazy-initialise once so we don't import the module when env vars are absent.
function getRedis() {
  if (upstashRedis) return upstashRedis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    // Dynamic require so the build doesn't fail if the package isn't installed yet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis')
    upstashRedis = new Redis({ url, token })
    return upstashRedis
  } catch {
    return null
  }
}

// ─── In-memory fallback (dev / CI only) ──────────────────────────────────────
// Per-instance, so it only blunts naive single-client abuse. Acceptable for
// local development; not acceptable for production multi-instance deployments.
interface Window { count: number; resetAt: number }
const buckets = new Map<string, Window>()

function rateLimitMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const w = buckets.get(key)
  if (!w || now > w.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
    }
    return true
  }
  if (w.count >= limit) return false
  w.count++
  return true
}

// ─── Distributed rate limit (production) ─────────────────────────────────────
/**
 * Returns true if the request is allowed; false if the limit is exceeded.
 * Uses Upstash Redis when configured, falls back to in-memory otherwise.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const redis = getRedis()
  if (!redis) {
    // Fallback: sync in-memory (dev/CI)
    return rateLimitMemory(key, limit, windowMs)
  }

  try {
    const windowSec = Math.ceil(windowMs / 1000)
    const windowKey = `rl:${key}:${Math.floor(Date.now() / windowMs)}`
    const count = await redis.incr(windowKey)
    // Only set TTL on the first increment to avoid resetting the window.
    if (count === 1) {
      await redis.expire(windowKey, windowSec)
    }
    return count <= limit
  } catch {
    // Redis error — fail open (allow the request) rather than blocking everyone.
    console.error('[rate-limit] Redis error, failing open')
    return true
  }
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0]?.trim() : '') || request.headers.get('x-real-ip') || 'unknown'
}
