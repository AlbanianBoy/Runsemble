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

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
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
    throw new Error((await extractError(res)) ?? `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}
