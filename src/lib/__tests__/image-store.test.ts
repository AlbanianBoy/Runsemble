import { describe, it, expect, afterEach, vi } from 'vitest'
import { isBlobConfigured, storeImage, deleteStoredImages } from '@/lib/image-store'

const put = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
vi.mock('@vercel/blob', () => ({ put, del }))

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.BLOB_STORE_ID
  delete process.env.BLOBB_STORE_ID
  put.mockReset()
  del.mockReset()
})

describe('isBlobConfigured', () => {
  it('is false with no credentials at all', () => {
    expect(isBlobConfigured()).toBe(false)
  })

  it('is true with the static read-write token', () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'tok'
    expect(isBlobConfigured()).toBe(true)
  })

  // BLOBB_STORE_ID is not a typo, however much it looks like one. Vercel derives
  // the env prefix from the store name, and ours is "runsemble-blobb" — so the
  // double B is the variable production actually runs on. "Correcting" it to
  // BLOB_STORE_ID matches nothing, and the only symptom is photos quietly going
  // back into Postgres: no error, no failed deploy, nothing to notice. This test
  // is here so that edit fails out loud instead.
  it('is true with BLOBB_STORE_ID alone — the double-B name production uses', () => {
    process.env.BLOBB_STORE_ID = 'store_vL0SkP1e6JRT'
    expect(isBlobConfigured()).toBe(true)
  })

  // The single-B name is kept as a fallback for a store connected with the
  // default prefix.
  it('is true with BLOB_STORE_ID alone (OIDC auth, no token exists)', () => {
    process.env.BLOB_STORE_ID = 'store_mF86AesQYNga'
    expect(isBlobConfigured()).toBe(true)
  })
})

describe('storeImage without a blob store', () => {
  // The pre-Blob behaviour must survive untouched, since this ships before the
  // store exists.
  it('returns the data URL unchanged and never uploads', async () => {
    expect(await storeImage(JPEG)).toBe(JPEG)
    expect(put).not.toHaveBeenCalled()
  })
})

describe('storeImage with an OIDC-authenticated store', () => {
  it('uploads via BLOBB_STORE_ID and passes that store id to put()', async () => {
    process.env.BLOBB_STORE_ID = 'store_vL0SkP1e6JRT'
    put.mockResolvedValue({ url: 'https://blob.example/posts/x.jpg' })

    expect(await storeImage(JPEG)).toBe('https://blob.example/posts/x.jpg')
    // Named explicitly so the SDK targets this store rather than auto-resolving.
    expect(put.mock.calls[0][2]).toMatchObject({ storeId: 'store_vL0SkP1e6JRT' })
  })

  it('prefers BLOBB_STORE_ID when both names are present', async () => {
    process.env.BLOBB_STORE_ID = 'store_vL0SkP1e6JRT'
    process.env.BLOB_STORE_ID = 'store_mF86AesQYNga'
    put.mockResolvedValue({ url: 'https://blob.example/posts/x.jpg' })

    await storeImage(JPEG)
    expect(put.mock.calls[0][2]).toMatchObject({ storeId: 'store_vL0SkP1e6JRT' })
  })

  it('uploads when only BLOB_STORE_ID is set', async () => {
    process.env.BLOB_STORE_ID = 'store_mF86AesQYNga'
    put.mockResolvedValue({ url: 'https://blob.example/posts/x.jpg' })

    expect(await storeImage(JPEG)).toBe('https://blob.example/posts/x.jpg')
    expect(put).toHaveBeenCalledOnce()
  })
})

describe('storeImage with a blob store', () => {
  it('uploads the decoded bytes and returns the blob URL', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'tok'
    put.mockResolvedValue({ url: 'https://blob.example/posts/x.jpg' })

    expect(await storeImage(JPEG)).toBe('https://blob.example/posts/x.jpg')

    const [path, body, opts] = put.mock.calls[0]
    expect(path).toMatch(/^posts\/[0-9a-f-]{36}\.jpg$/) // jpeg normalised to jpg
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(body).toEqual(Buffer.from('/9j/4AAQSkZJRg==', 'base64'))
    expect(opts).toMatchObject({ access: 'public', contentType: 'image/jpeg' })
  })

  it('keeps the extension for other image types', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'tok'
    put.mockResolvedValue({ url: 'https://blob.example/posts/x.png' })

    await storeImage('data:image/png;base64,iVBORw0KGgo=')
    expect(put.mock.calls[0][0]).toMatch(/\.png$/)
  })

  it('falls back to the data URL when the upload fails, rather than losing the post', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'tok'
    put.mockRejectedValue(new Error('blob down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await storeImage(JPEG)).toBe(JPEG)
  })

  it('passes through a value that is not a base64 data URL', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'tok'
    const url = 'https://blob.example/already-moved.jpg'

    expect(await storeImage(url)).toBe(url)
    expect(put).not.toHaveBeenCalled()
  })
})

describe('deleteStoredImages — erasure has to reach object storage', () => {
  // The DB cascade wipes every row on account deletion, but a cascade cannot
  // reach Blob: without an explicit del(), a deleted user's photos stayed
  // publicly addressable forever for anyone who kept the URL.
  const BLOB_URL = 'https://vl0skp1e6jrt6ckh.public.blob.vercel-storage.com/posts/a.jpg'

  it('deletes blob URLs and skips inline data: rows, which die with the cascade', async () => {
    process.env.BLOBB_STORE_ID = 'store_vL0SkP1e6JRT'
    del.mockResolvedValue(undefined)

    await deleteStoredImages([BLOB_URL, JPEG, null, undefined])

    expect(del).toHaveBeenCalledOnce()
    expect(del.mock.calls[0][0]).toEqual([BLOB_URL])
    expect(del.mock.calls[0][1]).toMatchObject({ storeId: 'store_vL0SkP1e6JRT' })
  })

  it('does nothing when no store is configured — nothing was ever uploaded', async () => {
    await deleteStoredImages([BLOB_URL])
    expect(del).not.toHaveBeenCalled()
  })

  it('does not call del for an all-inline list', async () => {
    process.env.BLOBB_STORE_ID = 'store_vL0SkP1e6JRT'
    await deleteStoredImages([JPEG, null])
    expect(del).not.toHaveBeenCalled()
  })

  it('never throws — account erasure must not fail because storage hiccuped', async () => {
    process.env.BLOBB_STORE_ID = 'store_vL0SkP1e6JRT'
    del.mockRejectedValue(new Error('blob down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(deleteStoredImages([BLOB_URL])).resolves.toBeUndefined()
  })
})
