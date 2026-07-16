import { randomUUID } from 'node:crypto'
import { put } from '@vercel/blob'

// ─── Post image storage ───────────────────────────────────────────────────────
// Photos reach the API as client-compressed JPEG data URLs. They used to be
// written straight into Postgres, which grows the database by the full size of
// every photo ever posted and drags on every query that selects the column.
//
// When a Blob store is configured we upload the bytes there and persist only the
// URL. When it isn't, we keep the old inline behaviour — so this ships safely
// before the store exists, and starts storing URLs the moment BLOB_READ_WRITE_TOKEN
// is present. Both forms render from an <img src>, so readers need no change and
// rows written under the old scheme keep working.

/**
 * True when a Vercel Blob store is reachable.
 *
 * Two ways to authenticate, and the modern one has no token at all:
 *   - OIDC — connecting a store sets BLOB_STORE_ID, and Vercel injects a
 *     short-lived VERCEL_OIDC_TOKEN at runtime. This is what our project uses.
 *   - BLOB_READ_WRITE_TOKEN — the older static token, still supported.
 *
 * Checking only for the token would mean a correctly connected store never gets
 * used, and every photo would keep going into Postgres with nothing to show that
 * anything was wrong. BLOB_STORE_ID isn't set for local dev, so `bun run dev`
 * still takes the inline path.
 */
export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID
}

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i

/**
 * Persist a `data:image/...;base64,...` URL and return what should be stored on
 * the row: a blob URL when possible, otherwise the original data URL.
 *
 * Never throws — a storage outage degrades to inline bytes rather than losing
 * the user's post.
 */
export async function storeImage(dataUrl: string): Promise<string> {
  if (!isBlobConfigured()) return dataUrl

  const match = DATA_URL.exec(dataUrl)
  if (!match) return dataUrl // already a URL, or not base64 — nothing to move

  const [, contentType, base64] = match
  try {
    const ext = contentType.slice('image/'.length).replace('jpeg', 'jpg')
    const { url } = await put(`posts/${randomUUID()}.${ext}`, Buffer.from(base64, 'base64'), {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    })
    return url
  } catch (error) {
    console.error('Blob upload failed — falling back to inline image:', error)
    return dataUrl
  }
}
