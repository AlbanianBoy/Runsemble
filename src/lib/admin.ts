import { getSessionUser } from '@/lib/auth'

// Who counts as an operator. The list lives in ADMIN_EMAILS (comma-separated).
// One definition so the /admin page and the admin-only routes can never disagree
// about who's allowed — the failure mode of two copies is a route that trusts
// someone the page doesn't.

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(email.toLowerCase())
}

/** The signed-in user if they're an operator, else null. Resolves the session. */
export async function getAdminUser() {
  const user = await getSessionUser()
  return user && isAdminEmail(user.email) ? user : null
}
