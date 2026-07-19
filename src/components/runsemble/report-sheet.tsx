'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { apiSend } from '@/lib/api'
import { track } from '@/lib/analytics'
import { REPORT_REASONS, type ReportReason, type ReportSubjectType } from '@/lib/enums'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

// A report needs a reason. Filing everything as 'other' told the operator only
// that *something* was wrong; a category tells them what to look for first. One
// sheet, reused wherever a report is filed (a post now, a person from the map).

const REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  spam: 'Spam',
  inappropriate: 'Inappropriate content',
  unsafe: 'Unsafe behaviour',
  impersonation: 'Impersonation',
  other: 'Something else',
}

export function ReportSheet({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  subjectLabel,
  onReported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjectType: ReportSubjectType
  subjectId: string | null
  /** e.g. a person's name, shown in the title so the user knows what they're flagging. */
  subjectLabel?: string
  /** Fired after a successful report — e.g. to also block, or close a parent sheet. */
  onReported?: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setReason(null)
    setDetails('')
    setSubmitting(false)
  }

  const submit = async () => {
    if (!reason || !subjectId) return
    setSubmitting(true)
    try {
      await apiSend('/api/reports', 'POST', { subjectType, subjectId, reason, details: details.trim() || undefined })
      track('report_filed', { subjectType, reason })
      toast.success('Report sent — an operator will take a look')
      onReported?.()
      onOpenChange(false)
      reset()
    } catch {
      toast.error('Could not send the report')
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Report {subjectLabel ?? 'this'}</SheetTitle>
        </SheetHeader>

        <p className="text-sm text-muted-foreground -mt-1">What&rsquo;s going on? An operator will review it.</p>

        <div className="mt-4 space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`w-full text-left rounded-xl border px-3.5 py-3 text-sm font-medium transition-colors ${
                reason === r
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:bg-muted/60'
              }`}
            >
              {REASON_LABELS[r]}
            </button>
          ))}
        </div>

        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Add anything that helps (optional)"
          className="mt-3"
          rows={2}
        />

        <Button
          onClick={submit}
          disabled={!reason || submitting}
          className="w-full rounded-full mt-4 font-semibold"
        >
          {submitting ? 'Sending…' : 'Send report'}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
