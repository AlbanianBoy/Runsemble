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

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url)
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
  const res = await fetch(url, {
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
