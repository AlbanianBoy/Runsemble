import { describe, it, expect } from 'vitest'
import {
  apiError,
  boundedInt,
  boundedString,
  readJson,
  MAX_ID_LENGTH,
  type JsonResult,
} from '@/lib/http'

// The request boundary. What's being pinned down here is the ANSWER a broken
// request gets, not the parsing: a half-sent body coming back as a 500 was how
// every one of these ended before, which told the client to retry something that
// could never work and put a fake incident in Sentry each time.

const post = (body?: string) =>
  new Request('http://localhost/api/messages', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  })

/**
 * The refusal, flattened. Throws if readJson accepted the body, so a test that
 * silently stops testing anything fails instead of passing.
 */
async function refusal(result: JsonResult) {
  if (result.ok) throw new Error('expected readJson to refuse this body')
  const body = (await result.response.json()) as { error: string; code: string }
  return { status: result.response.status, ...body }
}

describe('readJson', () => {
  it('answers a truncated body with 400, never 500', async () => {
    // A phone losing signal mid-POST sends exactly this. Nothing about it is the
    // server failing.
    const r = await refusal(await readJson(post('{"content":"halfway thro')))

    expect(r.status).toBe(400)
    expect(r.code).toBe('malformed_json')
  })

  it('answers an empty body with 400', async () => {
    // `await request.json()` throws on an empty string too, so a POST that
    // forgot its body took the same route to a 500.
    const r = await refusal(await readJson(post()))

    expect(r.status).toBe(400)
    expect(r.code).toBe('malformed_json')
  })

  it('refuses valid JSON that is not an object', async () => {
    // Parses fine, then every field the route destructures is undefined — so the
    // request died further down with a message about whichever field happened to
    // be checked first, which is a lie about what went wrong.
    for (const body of ['"just a string"', '42', 'null', '[1,2,3]']) {
      const r = await refusal(await readJson(post(body)))
      expect(r.status).toBe(400)
      expect(r.code).toBe('malformed_json')
    }
  })

  it('says something a person can read, not just a code', async () => {
    const r = await refusal(await readJson(post('{')))

    expect(typeof r.error).toBe('string')
    expect(r.error.length).toBeGreaterThan(0)
  })

  it('hands back the parsed object when the body is fine', async () => {
    const result = await readJson(post('{"recipientId":"abc","content":"hi"}'))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected readJson to accept this body')
    expect(result.body.recipientId).toBe('abc')
  })

  it('accepts an empty object — no fields is not the same as no body', async () => {
    const result = await readJson(post('{}'))

    expect(result.ok).toBe(true)
  })
})

describe('apiError', () => {
  it('still carries the human sentence alongside the code', async () => {
    // The whole app reads `error` today: api.ts turns it into the thrown Error's
    // message and several screens show it to the runner. Adding `code` must not
    // cost anyone that.
    const res = apiError(409, 'conflict', 'You already have a pending invite to this person')
    const body = (await res.json()) as { error: string; code: string }

    expect(res.status).toBe(409)
    expect(body.error).toBe('You already have a pending invite to this person')
    expect(body.code).toBe('conflict')
  })

  it('keeps the message verbatim, punctuation and all', async () => {
    // Migration is only safe if these strings survive byte for byte — a client
    // somewhere is still matching on them until it moves to the code.
    const res = apiError(400, 'invalid_value', "You can't invite yourself")
    const body = (await res.json()) as { error: string }

    expect(body.error).toBe("You can't invite yourself")
  })
})

describe('boundedInt', () => {
  // The feed's ?limit=, which decides how many rows Prisma is asked for.
  const limit = (v: unknown) => boundedInt(v, 1, 100, 100)

  it('takes a value already inside the bounds', () => {
    expect(limit('25')).toBe(25)
    expect(limit(25)).toBe(25)
  })

  it('accepts both ends exactly', () => {
    expect(limit('1')).toBe(1)
    expect(limit('100')).toBe(100)
  })

  it('clamps past either end instead of passing it on', () => {
    expect(limit('101')).toBe(100)
    expect(limit('999999')).toBe(100)
    expect(limit('0')).toBe(1)
    expect(limit('-40')).toBe(1)
  })

  it('truncates a fraction — `take` is a row count', () => {
    // ?limit=2.5 used to survive the old clamp intact and reach Prisma as 3.5.
    expect(limit('2.5')).toBe(2)
    expect(limit('99.9')).toBe(99)
  })

  it('falls back when there is nothing usable', () => {
    expect(limit(null)).toBe(100)
    expect(limit(undefined)).toBe(100)
    expect(limit('')).toBe(100)
    expect(limit('twenty')).toBe(100)
  })

  it('falls back rather than clamping an overflow to the maximum', () => {
    // '1e999' parses to Infinity. Clamping it to 100 would be a guess about what
    // a caller sending that meant; the default is the honest answer.
    expect(limit('1e999')).toBe(100)
    expect(limit(NaN)).toBe(100)
  })
})

describe('boundedString', () => {
  it('trims and returns a usable value', () => {
    expect(boundedString('  cm3k9wq0000  ', MAX_ID_LENGTH)).toBe('cm3k9wq0000')
  })

  it('refuses an over-long value rather than slicing it', () => {
    // Slicing an id doesn't shorten it, it makes it a different id — the query
    // then selects the wrong row, or none, and looks like it worked.
    const tooLong = 'a'.repeat(MAX_ID_LENGTH + 1)

    expect(boundedString(tooLong, MAX_ID_LENGTH)).toBeNull()
  })

  it('treats blank and non-string input as nothing', () => {
    expect(boundedString('', MAX_ID_LENGTH)).toBeNull()
    expect(boundedString('   ', MAX_ID_LENGTH)).toBeNull()
    expect(boundedString(null, MAX_ID_LENGTH)).toBeNull()
    expect(boundedString(42, MAX_ID_LENGTH)).toBeNull()
    expect(boundedString({ id: 'abc' }, MAX_ID_LENGTH)).toBeNull()
  })
})
