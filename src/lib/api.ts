// ─── Typed fetch helpers ──────────────────────────────────────────────────────
// Thin wrappers around fetch that return typed JSON and throw a useful error
// (the server's { error, code } when present) instead of silently resolving
// to a 500 body.
//
// `code` is the stable half of the error envelope (see src/lib/http.ts). Clients
// that need to branch — "already joined", session gone vs bad password — should
// read `ApiError.code`, not match prose in `message`. The human sentence stays
// on `message` for toasts and form alerts.
//
// Deliberately typed as string, not ErrorCode: importing http.ts here would pull
// next/server into every client bundle that uses apiGet/apiSend.

export class ApiError extends Error {
  readonly status: number
  /** Machine-readable code when the route has migrated to apiError(); null otherwise. */
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function extractError(
  res: Response
): Promise<{ message: string | null; code: string | null }> {
  try {
    const data = (await res.clone().json()) as { error?: string; code?: string }
    return {
      message: typeof data?.error === 'string' ? data.error : null,
      code: typeof data?.code === 'string' ? data.code : null,
    }
  } catch {
    return { message: null, code: null }
  }
}

function throwApiError(res: Response, extracted: { message: string | null; code: string | null }): never {
  throw new ApiError(
    extracted.message ?? `Request failed (${res.status})`,
    res.status,
    extracted.code
  )
}

// A 401 means the login session is gone (expired, revoked, or a pre-auth local
// profile). Reset to the login screen once instead of failing silently forever.
// Only triggered for primary/critical API calls — NOT background polling queries
// like the conversations list (which would cause an infinite reload loop).
//
// invalid_credentials is also 401 but is a login-form failure, not a missing
// session — those routes go through raw fetch in onboarding, not apiSend, so
// handleUnauthorized is not on that path today. If a future call uses api*
// against login, gate this on code !== 'invalid_credentials'.
let handling401 = false
function handleUnauthorized() {
  if (typeof window === 'undefined' || handling401) return
  handling401 = true
  try { localStorage.removeItem('runsemble-store') } catch { /* ignore */ }
  window.location.reload()
}

// Mobile networks stall. Without a cap a request can hang indefinitely, leaving
// the UI stuck. Abort after a generous timeout and surface it as a TypeError —
// the same shape as a dropped connection — so callers that queue offline on a
// network failure (notably the run save) treat a stuck request identically.
const REQUEST_TIMEOUT_MS = 20_000
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new TypeError('Request timed out')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** Standard GET — throws on error, triggers logout redirect on 401. */
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    throwApiError(res, await extractError(res))
  }
  return (await res.json()) as T
}

/**
 * Silent GET — throws on error like apiGet but NEVER triggers a 401 redirect.
 * Use this for background/polling queries (e.g. conversations list) where a
 * transient 401 should just show an empty result rather than nuking the app.
 */
export async function apiGetSilent<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    throwApiError(res, await extractError(res))
  }
  return (await res.json()) as T
}

export async function apiSend<T>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> {
  const res = await fetchWithTimeout(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    throwApiError(res, await extractError(res))
  }
  return (await res.json()) as T
}
