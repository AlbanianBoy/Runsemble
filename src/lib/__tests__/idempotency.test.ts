import { describe, it, expect } from 'vitest'
import { readClientId } from '@/lib/idempotency'
import { newClientId } from '@/lib/client-id'

describe('readClientId', () => {
  it('accepts a normal generated id', () => {
    const id = newClientId()
    expect(readClientId(id)).toBe(id)
  })

  it('trims surrounding whitespace so a padded id still matches its earlier self', () => {
    expect(readClientId('  abc123  ')).toBe('abc123')
  })

  // Absent means "no idempotency", not "reject the write". An older app build
  // that doesn't send one has to keep working, and a possible duplicate is a
  // milder failure than refusing to send at all.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 12345],
    ['an object', { id: 'x' }],
    ['an array', ['x']],
    ['empty string', ''],
    ['only whitespace', '   '],
  ])('returns null for %s', (_label, value) => {
    expect(readClientId(value)).toBeNull()
  })

  it('rejects an over-long id rather than letting it reach the column', () => {
    expect(readClientId('x'.repeat(65))).toBeNull()
    expect(readClientId('x'.repeat(64))).toBe('x'.repeat(64))
  })
})

describe('newClientId', () => {
  it('is unique across many calls', () => {
    const ids = new Set(Array.from({ length: 5000 }, newClientId))
    expect(ids.size).toBe(5000)
  })

  it('produces something the server will accept', () => {
    for (let i = 0; i < 100; i++) {
      const id = newClientId()
      expect(readClientId(id)).toBe(id)
    }
  })

  it('still returns an id when crypto.randomUUID is unavailable', () => {
    // Not hypothetical: this app also runs inside a Capacitor WebView, and
    // randomUUID needs a secure context. Throwing here would break sending
    // entirely, which is far worse than a slightly weaker id.
    const original = globalThis.crypto
    try {
      // @ts-expect-error — deliberately removing it to exercise the fallback
      delete globalThis.crypto
      const id = newClientId()
      expect(typeof id).toBe('string')
      expect(readClientId(id)).toBe(id)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})
