import { describe, it, expect } from 'vitest'
import { validatePassword, hashPassword, verifyPassword } from '@/lib/password'

describe('validatePassword', () => {
  it('accepts a reasonable passphrase', () => {
    expect(validatePassword('correct horse battery')).toBeNull()
    expect(validatePassword('m1dnight-runs-in-antwerp')).toBeNull()
  })

  it('rejects anything shorter than 8 characters', () => {
    expect(validatePassword('short')).toMatch(/at least 8/)
    expect(validatePassword('')).toMatch(/at least 8/)
  })

  it('rejects absurdly long input', () => {
    // scrypt is memory-hard, so unbounded length is free server work.
    expect(validatePassword('a'.repeat(129))).toMatch(/at most 128/)
  })

  it('rejects non-strings', () => {
    expect(validatePassword(undefined)).toBe('Password is required')
    expect(validatePassword(12345678)).toBe('Password is required')
  })

  it('rejects the passwords bots actually try', () => {
    expect(validatePassword('password')).toMatch(/too common/)
    expect(validatePassword('PASSWORD123')).toMatch(/too common/)
    expect(validatePassword('letmein123')).toMatch(/too common/)
  })

  it('rejects a single repeated character', () => {
    expect(validatePassword('aaaaaaaa')).toMatch(/repeated character/)
    expect(validatePassword('11111111')).toMatch(/repeated character/)
  })

  it('rejects keyboard and number runs', () => {
    expect(validatePassword('abcdefgh')).toMatch(/sequence|too common/)
    expect(validatePassword('0123456789')).toMatch(/sequence|too common/)
  })

  it('rejects a password containing the email local part', () => {
    expect(validatePassword('arianbehrami2002', 'arianbehrami2002@hotmail.com')).toMatch(/email/)
    // Too short a local part would over-reject, so it is ignored.
    expect(validatePassword('abc-running-club', 'abc@hotmail.com')).toBeNull()
  })
})

describe('hashPassword / verifyPassword', () => {
  it('round-trips and salts each hash differently', () => {
    const a = hashPassword('correct horse battery')
    const b = hashPassword('correct horse battery')
    expect(a).not.toBe(b)
    expect(verifyPassword('correct horse battery', a)).toBe(true)
    expect(verifyPassword('wrong horse battery', a)).toBe(false)
  })

  it('does not throw on a malformed stored value', () => {
    expect(verifyPassword('whatever', 'garbage')).toBe(false)
    expect(verifyPassword('whatever', '')).toBe(false)
  })
})
