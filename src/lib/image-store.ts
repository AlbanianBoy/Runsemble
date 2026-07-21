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

// ─── Server-side image validation ────────────────────────────────────────────
// The client compresses and re-encodes photos in a canvas, which strips EXIF and
// produces a real JPEG — but that is a courtesy of the happy path, not a control.
// Anyone can POST the API directly. Trusting the declared `data:image/...` prefix
// meant SVG (which can carry script) and arbitrary bytes were both accepted, and
// the attacker-chosen content-type was what got written to public Blob storage.
//
// So the format is decided by the bytes themselves. Note what this does NOT do:
// it validates and constrains, it does not re-encode, so EXIF inside an
// otherwise-valid JPEG survives. Re-encoding server-side needs an image library
// (sharp), which is a real bundle-size decision rather than a quick win.

/** Decoded, not base64 — the string form is ~33% larger than the actual bytes. */
const MAX_IMAGE_BYTES = 600_000

// `minBytes` is per-signature rather than one global floor: WebP can't be
// identified in under 12 bytes, but a PNG signature is 8 and a JPEG marker 3.
// A single floor would reject formats it had already recognised.
const SIGNATURES: { type: string; ext: string; minBytes: number; match: (b: Buffer) => boolean }[] = [
  {
    type: 'image/jpeg',
    ext: 'jpg',
    minBytes: 3,
    match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: 'image/png',
    ext: 'png',
    minBytes: 8,
    match: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: 'image/webp',
    ext: 'webp',
    minBytes: 12,
    // "RIFF" .... "WEBP" — the size field sits between the two markers.
    match: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
]

export interface ValidatedImage {
  bytes: Buffer
  /** Derived from the magic bytes, never from what the client declared. */
  contentType: string
  ext: string
}

/**
 * Validate a `data:image/...;base64,...` payload. Returns the decoded bytes and
 * the format the bytes actually are, or an error string safe to show the user.
 */
export function validateImageDataUrl(dataUrl: string): { ok: true; image: ValidatedImage } | { ok: false; error: string } {
  const match = DATA_URL.exec(dataUrl)
  if (!match) return { ok: false, error: 'Invalid image' }

  let bytes: Buffer
  try {
    bytes = Buffer.from(match[2], 'base64')
  } catch {
    return { ok: false, error: 'Invalid image' }
  }
  if (bytes.length === 0) return { ok: false, error: 'Invalid image' }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image too large — try a smaller photo' }
  }

  const sig = SIGNATURES.find((s) => bytes.length >= s.minBytes && s.match(bytes))
  if (!sig) {
    // Deliberately explicit: SVG and GIF land here, and SVG being refused is the
    // point — it is a document format that can execute script.
    return { ok: false, error: 'That image format isn’t supported — use a JPEG, PNG or WebP' }
  }

  return { ok: true, image: { bytes, contentType: sig.type, ext: sig.ext } }
}

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

  // The extension and content-type written to a PUBLIC url come from the bytes,
  // not from the client's declaration — otherwise the caller chooses how their
  // upload will later be served back to browsers.
  const validated = validateImageDataUrl(dataUrl)
  if (!validated.ok) return dataUrl // already a URL, or not something we store

  const { bytes, contentType, ext } = validated.image
  const storeId = getBlobStoreId()

  try {
    const { url } = await put(`posts/${randomUUID()}.${ext}`, bytes, {
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
