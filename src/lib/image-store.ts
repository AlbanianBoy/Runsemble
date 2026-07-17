import { randomUUID } from 'node:crypto'
import { put, del } from '@vercel/blob'

// ─── Post image storage ───────────────────────────────────────────────────────
// Photos reach the API as client-compressed JPEG data URLs. They used to be
// written straight into Postgres, which grows the database by the full size of
// every photo ever posted and drags on every query that selects the column.
//
// When a Blob store is configured we upload the bytes there and persist only the
// URL. When it isn't, we keep the old inline behaviour — so this ships safely
// before the store exists, and starts storing URLs the moment the store is
// connected. Both forms render from an <img src>, so readers need no change and
// rows written under the old scheme keep working.

/**
 * True when the public Vercel Blob store (runsemble-blobb) is reachable.
 *
 * Connecting the store injects BLOBB_STORE_ID (double-B prefix, matching the
 * store name) plus OIDC auth via VERCEL_OIDC_TOKEN at runtime. We also support
 * the older static BLOB_READ_WRITE_TOKEN for local overrides.
 */
export function isBlobConfigured(): boolean {
  return (
    !!process.env.BLOBB_STORE_ID ||
    !!process.env.BLOB_STORE_ID ||
    !!process.env.BLOB_READ_WRITE_TOKEN
  )
}

/** The store ID for the public runsemble-blobb store, whichever env var name Vercel chose. */
function getBlobStoreId(): string | undefined {
  return process.env.BLOBB_STORE_ID ?? process.env.BLOB_STORE_ID
}

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i

/**
 * Delete stored blob images, given whatever the imageUrl column holds.
 *
 * Account deletion cascades every DB row, but a cascade cannot reach object
 * storage — without this, a deleted user's photos stayed in Blob forever,
 * publicly addressable by anyone who kept the URL. That's incomplete GDPR
 * erasure, and the kind that never surfaces: nothing errors, the objects just
 * quietly outlive the person.
 *
 * Inline `data:` rows (pre-Blob posts) live in the DB and die with the cascade,
 * so only real URLs are sent to del(). Best-effort by design — erasure of the
 * account must not fail because storage hiccuped — but failures are logged so
 * an orphan is at least visible somewhere.
 */
export async function deleteStoredImages(urls: Array<string | null | undefined>): Promise<void> {
  if (!isBlobConfigured()) return
  const blobUrls = urls.filter((u): u is string => !!u && /^https?:\/\//i.test(u))
  if (blobUrls.length === 0) return

  const storeId = getBlobStoreId()
  try {
    await del(blobUrls, storeId ? { storeId } : undefined)
  } catch (error) {
    console.error(`Blob cleanup failed — ${blobUrls.length} image(s) may be orphaned:`, error)
  }
}

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
  const storeId = getBlobStoreId()

  try {
    const ext = contentType.slice('image/'.length).replace('jpeg', 'jpg')
    const { url } = await put(`posts/${randomUUID()}.${ext}`, Buffer.from(base64, 'base64'), {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      // Pass the store ID explicitly so the SDK always targets the public store
      // and never auto-resolves to a stale private binding.
      ...(storeId ? { storeId } : {}),
    })
    return url
  } catch (error) {
    console.error('Blob upload failed — falling back to inline image:', error)
    return dataUrl
  }
}
