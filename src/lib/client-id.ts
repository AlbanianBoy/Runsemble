// ─── newClientId ──────────────────────────────────────────────────────────────
// An id for a thing the user composed — a message, a post, a comment — created
// once when they compose it and sent with every attempt to deliver it, so a
// retry after a lost response lands on the same row instead of a second one.
// See src/lib/idempotency.ts for the server half.
//
// Lives in its own file with no imports so both halves can use it: the server
// module it belongs to would otherwise have to be safe for the client bundle
// forever, which is a constraint that quietly breaks the first time someone adds
// a database import to it.

/**
 * A random id, unique enough for this purpose.
 *
 * crypto.randomUUID needs a secure context, and this app runs inside a Capacitor
 * WebView as well as a browser, so the fallback is not theoretical — an
 * exception here would break sending entirely, which is far worse than a
 * slightly weaker id. Collisions only matter within one account anyway: the
 * unique constraint is scoped per user, so two people cannot collide with each
 * other no matter what this returns.
 */
export function newClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through — some WebViews expose crypto but throw on randomUUID.
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}
