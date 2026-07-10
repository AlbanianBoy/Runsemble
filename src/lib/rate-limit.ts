// ─── Rate limiting (pilot-grade) ──────────────────────────────────────────────
// A tiny fixed-window limiter for abuse-sensitive routes (login, signup, password
// reset). Keyed by client IP + a bucket name.
//
// HONEST CAVEAT: Vercel functions are stateless and horizontally scaled, so this
// in-memory counter is PER INSTANCE — a determined attacker hitting many cold
// instances gets more than `limit` requests. It still blunts naive abuse (a
// single client hammering login) at pilot scale for free. Move to a shared store
// (Upstash / Vercel KV) before this needs to be authoritative.

interface Window { count: number; resetAt: number }
const buckets = new Map<string, Window>()

/** True if the request is allowed; false if the caller has exceeded the window. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
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

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0]?.trim() : '') || request.headers.get('x-real-ip') || 'unknown'
}
