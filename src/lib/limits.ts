// Server-side length caps for user-supplied text. Generous enough that normal
// use never hits them, but they stop a single request writing a multi-megabyte
// row (accidental paste or abuse). Enforced with a 400, not silent truncation,
// so nothing is quietly lost.
export const LIMITS = {
  post: 2000,
  comment: 1000,
  message: 1000,
  bio: 300,
  name: 60,
  groupName: 80,
  groupDesc: 500,
  place: 200,
} as const

/** True when value is a string longer than max (so the route can reject it). */
export function overLimit(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max
}
