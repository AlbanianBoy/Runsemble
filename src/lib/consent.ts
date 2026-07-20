// ─── Consent versioning ───────────────────────────────────────────────────────
// GDPR asks you to be able to show what a user agreed to, not just that they
// agreed. A lone `consentAt` timestamp can't answer that once the policy text
// changes — you know someone clicked accept in July, but not which July wording.
//
// So every acceptance records the version alongside the timestamp. Bump this
// whenever the privacy policy changes in a way that affects what is collected
// or who it is shared with; a typo fix is not a new version.
//
// Date-based on purpose: it self-documents which text was live, and it sorts.

export const CURRENT_POLICY_VERSION = '2026-07-20'

// The minimum age to create an account. GDPR's baseline for a child's own
// consent is 16; some countries lower it (Belgium sets it at 13). 16 is the
// conservative choice — valid everywhere in the EEA — and for an app that shares
// location and introduces strangers, erring older is the safer default. Lower it
// to a country's digital-consent age only with legal input.
export const MIN_AGE = 16

/**
 * Whether a self-declared birthdate clears the age gate. Anything unparseable or
 * in the future is treated as failing, not passing — the gate fails closed.
 */
export function isOldEnough(birthdate: Date | string | null | undefined, today = new Date()): boolean {
  if (!birthdate) return false
  const dob = typeof birthdate === 'string' ? new Date(birthdate) : birthdate
  if (Number.isNaN(dob.getTime()) || dob > today) return false
  let age = today.getFullYear() - dob.getFullYear()
  const beforeBirthday =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  if (beforeBirthday) age--
  return age >= MIN_AGE
}

/**
 * True when this user accepted a policy older than the current one — i.e. they
 * need to be re-asked. A null version means the account predates version
 * tracking, which also counts as stale.
 */
export function needsReconsent(consentVersion: string | null | undefined): boolean {
  return consentVersion !== CURRENT_POLICY_VERSION
}
