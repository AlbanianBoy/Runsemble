import { describe, it, expect, afterEach, vi } from 'vitest'
import { isBlobConfigured, storeImage } from '@/lib/image-store'

const put = vi.hoisted(() => vi.fn())
vi.mock('@vercel/blob', () => ({ put }))

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN
  put.mockReset()
})

describe('isBlobConfigured', () => {
  it('is false without a token', () => {
    expect(isBlobConfigured()).toBe(false)
  })

  it('is true once the token is present', () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'tok'
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
