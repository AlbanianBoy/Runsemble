'use client'

// ─── Re-consent ──────────────────────────────────────────────────────────────
// Recording WHICH policy version someone accepted is only worth anything if a
// change actually reaches them. Without this, `needsReconsent` was dead code and
// a policy update silently treated existing users as having agreed to text they
// had never seen.
//
// Deliberately not dismissable: closing it or reloading brings it back, because
// "I didn't answer" is not consent. But it is not a trap either — declining logs
// you out, and the account and its data stay exactly where they were, reachable
// on your next login (including the export and delete controls). Consent you
// can't refuse isn't consent.

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
import { CURRENT_POLICY_VERSION } from '@/lib/consent'
import { Button } from '@/components/ui/button'

export function ReconsentGate() {
  const { updateProfile } = useRunsembleStore()
  const [busy, setBusy] = useState(false)

  const accept = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/consent', { method: 'POST' })
      if (!res.ok) throw new Error()
      // Reflect it locally so the gate closes without a round trip to /me.
      updateProfile({ consentVersion: CURRENT_POLICY_VERSION })
    } catch {
      toast.error('Could not save that — check your connection and try again')
      setBusy(false)
    }
  }

  const decline = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('runsemble-store')
    location.reload()
  }

  return (
    <main className="min-h-screen flex flex-col justify-center p-6 bg-background">
      <div className="max-w-md mx-auto w-full">
        <FileText className="h-6 w-6 text-primary mb-3" />
        <h1 className="text-2xl font-bold tracking-tight mb-2">Our privacy policy has changed</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Runsemble shares your approximate location with other runners, so we&rsquo;d rather ask
          than assume. Please have a look at what we collect and why — it&rsquo;s short.
        </p>

        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border p-3.5 text-sm font-medium hover:bg-muted/60 transition-colors"
        >
          Read the privacy policy →
        </a>

        <Button
          size="lg"
          className="w-full rounded-full font-semibold mt-5"
          onClick={accept}
          disabled={busy}
        >
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          I&rsquo;ve read it — continue
        </Button>

        <button
          onClick={decline}
          className="block mx-auto mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          Not now — log me out
        </button>
        <p className="text-[11px] text-muted-foreground/80 text-center mt-3">
          Declining changes nothing about your account. Your runs and data stay as they are, and
          you can export or delete them any time from your profile.
        </p>
      </div>
    </main>
  )
}
