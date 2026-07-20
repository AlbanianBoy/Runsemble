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

/**
 * True when this user accepted a policy older than the current one — i.e. they
 * need to be re-asked. A null version means the account predates version
 * tracking, which also counts as stale.
 */
export function needsReconsent(consentVersion: string | null | undefined): boolean {
  return consentVersion !== CURRENT_POLICY_VERSION
}
