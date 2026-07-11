// ─── Typed fetch helpers ──────────────────────────────────────────────────────
// Thin wrappers around fetch that return typed JSON and throw a useful error
// (the server's { error } message when present) instead of silently resolving
// to a 500 body.

async function extractError(res: Response): Promise<string | null> {
  try {
    const data = (await res.clone().json()) as { error?: string }
    return data?.error ?? null
  } catch {
    return null
  }
}

// A 401 means the login session is gone (expired, revoked, or a pre-auth local
// profile). Reset to the login screen once instead of failing silently forever.
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

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    throw new Error((await extractError(res)) ?? `Request failed (${res.status})`)
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
    throw new Error((await extractError(res)) ?? `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}
