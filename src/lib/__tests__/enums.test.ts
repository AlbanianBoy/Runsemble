import { describe, it, expect } from 'vitest'
import { $Enums } from '@prisma/client'
import {
  PACE_LEVELS,
  SCHEDULE_PREFERENCES,
  SPORT_TYPES,
  POST_TYPES,
  GROUP_ROLES,
  PARTICIPANT_STATUSES,
  INVITE_STATUSES,
  isOneOf,
  validateEnumFields,
} from '@/lib/enums'

// src/lib/enums.ts is hand-maintained so the browser doesn't have to import the
// Prisma client. That only holds up if it matches the schema — these assertions
// are what make "add a value to the enum" fail loudly instead of quietly
// rejecting valid input at the API edge.
//
// NOTE: SchedulePreference is intentionally absent here. It was dropped as a
// Prisma enum — the column is now a plain String (comma-separated values).
// $Enums.SchedulePreference no longer exists in the generated client.
// SCHEDULE_PREFERENCES still lives in enums.ts for request-time validation.
describe('enums match prisma/schema.prisma', () => {
  const cases: [string, readonly string[], Record<string, string>][] = [
    ['PaceLevel', PACE_LEVELS, $Enums.PaceLevel],
    ['SportType', SPORT_TYPES, $Enums.SportType],
    ['PostType', POST_TYPES, $Enums.PostType],
    ['GroupRole', GROUP_ROLES, $Enums.GroupRole],
    ['ParticipantStatus', PARTICIPANT_STATUSES, $Enums.ParticipantStatus],
    ['InviteStatus', INVITE_STATUSES, $Enums.InviteStatus],
  ]

  it.each(cases)('%s', (_name, ours, generated) => {
    expect([...ours].sort()).toEqual(Object.values(generated).sort())
  })
})

describe('isOneOf', () => {
  it('accepts a member', () => {
    expect(isOneOf(PACE_LEVELS, 'beginner')).toBe(true)
  })

  it('rejects a non-member and non-strings', () => {
    expect(isOneOf(PACE_LEVELS, 'fast')).toBe(false)
    expect(isOneOf(PACE_LEVELS, 42)).toBe(false)
    expect(isOneOf(PACE_LEVELS, undefined)).toBe(false)
    expect(isOneOf(PACE_LEVELS, null)).toBe(false)
  })

  it('does not match on case or whitespace', () => {
    expect(isOneOf(PACE_LEVELS, 'Beginner')).toBe(false)
    expect(isOneOf(PACE_LEVELS, ' beginner')).toBe(false)
  })
})

describe('validateEnumFields', () => {
  const fields = { paceLevel: PACE_LEVELS, schedulePreference: SCHEDULE_PREFERENCES }

  it('passes when every present field is valid', () => {
    expect(validateEnumFields({ paceLevel: 'advanced' }, fields)).toBeNull()
  })

  it('ignores absent fields, so PATCH can send any subset', () => {
    expect(validateEnumFields({ name: 'Arian' }, fields)).toBeNull()
    expect(validateEnumFields({}, fields)).toBeNull()
  })

  it('ignores null — clearing a field is not the same as a bad value', () => {
    expect(validateEnumFields({ paceLevel: null }, fields)).toBeNull()
  })

  // Derived from PACE_LEVELS rather than spelled out: this test is about the
  // message naming the field and listing what's allowed, not about which values
  // are allowed today. Hardcoding the list makes a legitimate change to it fail a
  // test that has no opinion on it — which is exactly what happened when 'any'
  // was restored.
  it('names the offending field and its allowed values', () => {
    expect(validateEnumFields({ paceLevel: 'fast' }, fields)).toBe(
      `paceLevel must be one of: ${PACE_LEVELS.join(', ')}`
    )
  })

  it('accepts "any" — "I\'ll run with anyone" is a real answer, not a placeholder', () => {
    expect(validateEnumFields({ paceLevel: 'any' }, fields)).toBeNull()
  })

  it('catches a bad value on any field, not just the first', () => {
    expect(validateEnumFields({ paceLevel: 'advanced', schedulePreference: 'midnight' }, fields)).toBe(
      'schedulePreference must be one of: morning, afternoon, evening'
    )
  })
})
