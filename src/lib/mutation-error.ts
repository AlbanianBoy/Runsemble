'use client'

// ─── One place that decides what a failed mutation looks like ─────────────────
// Almost every mutation in the app ends `onError: (e) => toast.error(e.message)`.
// That is right for most failures and wrong for the one that has a fix: a 403
// from the email gate is not news to deliver, it is a door to open. A toast
// there tells someone no at the exact moment they tried to do something, and
// leaves them to go hunting through settings for the way through.
//
// Keyed on the machine-readable code rather than the sentence — see lib/http.ts
// for why matching prose is a trap.

import { toast } from 'sonner'
import { ApiError } from './api'
import { useRunsembleStore } from './store'

/**
 * Show a failed mutation to the user. Opens the verification sheet when the
 * server refused for want of a confirmed address; otherwise toasts the message.
 */
export function showMutationError(error: Error): void {
  if (error instanceof ApiError && error.code === 'email_unverified') {
    useRunsembleStore.getState().setVerifyPromptOpen(true)
    return
  }
  toast.error(error.message)
}
