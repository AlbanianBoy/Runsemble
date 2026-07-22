'use client'

// ─── VerifyEmailGate ──────────────────────────────────────────────────────────
// The door in the wall that lib/capabilities.ts puts up.
//
// Messaging, inviting, posting and commenting now need a confirmed address. A
// refusal that only produced a toast would be a dead end — the person is told
// no, at the moment they were trying to do something, with no way to fix it
// without hunting through settings. So the refusal opens this instead: the code
// can be re-sent and entered right here, and the action is theirs to retry.
//
// Mounted once globally next to the other overlays, because any gated action
// can raise it and they all want the same single answer.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
import { apiSend } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

export function VerifyEmailGate() {
  const { verifyPromptOpen, setVerifyPromptOpen, currentUser, updateProfile } = useRunsembleStore()
  const [code, setCode] = useState('')

  const resend = useMutation({
    mutationFn: () => apiSend<{ ok: boolean }>('/api/auth/send-verification', 'POST'),
    onSuccess: () => toast.success('Code sent — check your inbox'),
    onError: (e: Error) => toast.error(e.message),
  })

  const confirm = useMutation({
    mutationFn: () => apiSend<{ ok: boolean }>('/api/auth/verify-email', 'POST', { code: code.trim() }),
    onSuccess: () => {
      // Update the local profile so the gated buttons stop refusing immediately,
      // rather than after whatever refetch happens to come next.
      updateProfile({ emailVerified: true })
      setVerifyPromptOpen(false)
      setCode('')
      toast.success('Email confirmed — you’re all set')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Sheet open={verifyPromptOpen} onOpenChange={setVerifyPromptOpen}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <div className="p-4 space-y-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MailCheck className="h-5 w-5 text-primary" />
              Confirm your email
            </SheetTitle>
            <SheetDescription>
              {/* Says why, not just what. A gate whose reason is unexplained reads
                  as the app being broken or arbitrary. */}
              Messaging, invites and posting need a confirmed address — it&apos;s what keeps
              throwaway accounts from reaching real runners. Everything else stays open.
            </SheetDescription>
          </SheetHeader>

          <div>
            <Label htmlFor="verify-code">6-digit code</Label>
            <Input
              id="verify-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="mt-1.5 tabular tracking-[0.3em] text-center text-lg"
            />
            {currentUser?.email && (
              <p className="text-xs text-muted-foreground mt-1.5">Sent to {currentUser.email}</p>
            )}
          </div>

          <Button
            className="w-full h-12 rounded-full font-semibold"
            onClick={() => confirm.mutate()}
            disabled={code.trim().length < 6 || confirm.isPending}
          >
            {confirm.isPending ? 'Checking…' : 'Confirm'}
          </Button>

          <button
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            className="block w-full min-h-11 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {resend.isPending ? 'Sending…' : "Didn't get it? Send a new code"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
