// ─── Rate limiting ────────────────────────────────────────────────────────────
// A fixed-window limiter with two backends behind one function.
//
// If a shared Redis is configured (Upstash or Vercel KV — both speak the same
// REST protocol and the Vercel integrations set the env vars for you), counters
// live there and the limit is real across every serverless instance. If it isn't
// configured, it falls back to an in-memory Map.
//
// The fallback is honestly weak and the comment stays here so nobody forgets:
// Vercel functions are stateless and horizontally scaled, so an in-memory
// counter is PER INSTANCE. It blunts a single client hammering login and does
// almost nothing against anyone determined. It is free and better than nothing
// at pilot scale; it is not a control you can point at.
//
// The point of the split is that turning on the real one is an env var and a
// redeploy, not a refactor of every call site. Set either pair:
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   KV_REST_API_URL        + KV_REST_API_TOKEN
// No SDK: Upstash's REST API is plain fetch, so this adds no dependency and
// nothing to keep patched.
//
// /api/admin/diagnostics reports which backend the running instance picked, so
// "did the env var take" is answerable without guessing.

interface Window { count: number; resetAt: number }
const buckets = new Map<string, Window>()

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

/** Which backend this instance is using — surfaced by the diagnostics endpoint. */
export function rateLimitBackend(): 'redis' | 'in-memory' {
  return redisConfig() ? 'redis' : 'in-memory'
}

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const w = buckets.get(key)
  if (!w || now > w.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    // Opportunistic cleanup so the map can't grow without bound.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
    }
    return true
  }
  if (w.count >= limit) return false
  w.count++
  return true
}

/**
 * INCR the counter and set its TTL only when the key is new, which is the whole
 * fixed window in two commands and one round trip. EXPIRE ... NX matters: a
 * plain EXPIRE on every request slides the window forward, so a caller sending
 * steadily would never see it reset and could be locked out for ever.
 */
async function redisLimit(
  cfg: { url: string; token: string },
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000))
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(seconds), 'NX'],
    ]),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`rate-limit store returned ${res.status}`)

  const body = (await res.json()) as Array<{ result?: unknown; error?: string }>
  const incr = body?.[0]
  if (incr?.error) throw new Error(incr.error)
  const count = Number(incr?.result)
  if (!Number.isFinite(count)) throw new Error('rate-limit store returned no count')
  return count <= limit
}

/**
 * True if the request is allowed, false if the caller has spent the window.
 *
 * Fails OPEN. If the shared store is unreachable the request is allowed and the
 * failure is logged: a limiter that takes the whole site down when Redis blinks
 * has turned a spam problem into an outage, which is the worse of the two. The
 * log line is the signal that the control is currently off.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const cfg = redisConfig()
  if (!cfg) return memoryLimit(key, limit, windowMs)
  try {
    return await redisLimit(cfg, key, limit, windowMs)
  } catch (error) {
    console.error('Rate limit store unavailable — allowing request:', error)
    return true
  }
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0]?.trim() : '') || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Key an authenticated action to the ACCOUNT, not the IP.
 *
 * For spam and harassment the account is the thing that matters: a sender on
 * mobile data changes IP for free, and several genuine users behind one office
 * or campus NAT share one. IP is the right key only before there is a session —
 * signup and login, where an account doesn't exist yet.
 */
export function userKey(bucket: string, userId: string): string {
  return `${bucket}:u:${userId}`
}
