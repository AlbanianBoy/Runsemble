'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// The moderation queue's interactive half. The page renders open reports
// server-side; this turns each into something an operator can action, calling
// PATCH /api/reports/[id] and refreshing the server component on success.

export interface AdminReport {
  id: string
  subjectType: 'user' | 'post' | 'message'
  subjectId: string
  reason: string
  details: string | null
  evidence: string | null // JSON snapshot captured when filed
  status: string
  createdAt: string
  reporterName: string
  reporterEmail: string
  subjectReportCount: number // how many people have reported this subject
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Pull the human-readable line out of the evidence snapshot, whatever it is. */
function evidenceText(evidence: string | null): string | null {
  if (!evidence) return null
  try {
    const e = JSON.parse(evidence) as Record<string, unknown>
    const s = e.content ?? e.bio ?? e.name
    return typeof s === 'string' && s.trim() ? s : null
  } catch {
    return null
  }
}

export function ReportQueue({ reports }: { reports: AdminReport[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  const act = async (id: string, status: 'resolved' | 'dismissed' | 'reviewing') => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  // Suspend the reported account, then resolve the report. This is the queue's
  // enforcement power — a reviewed report can now end in the subject being
  // pulled from the app, not just a status change.
  const suspendSubject = async (report: AdminReport) => {
    if (!confirm(`Suspend this account? They'll be logged out and hidden from the app until reinstated.`)) return
    setBusyId(report.id)
    try {
      const res = await fetch(`/api/admin/users/${report.subjectId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend: true, reason: `report ${report.id}: ${report.reason}` }),
      })
      if (res.ok) {
        await fetch(`/api/reports/${report.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'resolved' }),
        })
        router.refresh()
      }
    } finally {
      setBusyId(null)
    }
  }

  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4">
        No open reports. Quiet is good.
      </p>
    )
  }

  return (
    <div className="rounded-xl border divide-y">
      {reports.map((r) => {
        const snippet = evidenceText(r.evidence)
        return (
          <div key={r.id} className="p-3 text-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase">
                  {r.subjectType}
                </span>{' '}
                <span className="font-medium">{r.reason}</span>
                {r.subjectReportCount > 1 && (
                  <span className="ml-2 text-[11px] font-semibold text-destructive">
                    {r.subjectReportCount}× reported
                  </span>
                )}
                {r.status === 'reviewing' && (
                  <span className="ml-2 text-[11px] text-amber-600">reviewing</span>
                )}
              </p>
              <span className="text-[11px] text-muted-foreground/70">{fmt(r.createdAt)}</span>
            </div>

            <p className="text-[11px] text-muted-foreground">
              by {r.reporterName} ({r.reporterEmail}) · subject id{' '}
              <code className="text-[10px]">{r.subjectId}</code>
            </p>

            {r.details && <p className="text-muted-foreground">“{r.details}”</p>}
            {snippet && (
              <p className="text-muted-foreground/80 border-l-2 pl-2 text-[13px] italic">{snippet}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => act(r.id, 'resolved')}
                disabled={busyId === r.id}
                className="rounded-full bg-primary text-primary-foreground text-xs px-3 py-1 font-medium disabled:opacity-50"
              >
                Resolve
              </button>
              <button
                onClick={() => act(r.id, 'dismissed')}
                disabled={busyId === r.id}
                className="rounded-full border text-xs px-3 py-1 disabled:opacity-50"
              >
                Dismiss
              </button>
              {r.status !== 'reviewing' && (
                <button
                  onClick={() => act(r.id, 'reviewing')}
                  disabled={busyId === r.id}
                  className="rounded-full border text-xs px-3 py-1 text-muted-foreground disabled:opacity-50"
                >
                  Mark reviewing
                </button>
              )}
              {r.subjectType === 'user' && (
                <button
                  onClick={() => suspendSubject(r)}
                  disabled={busyId === r.id}
                  className="rounded-full border border-destructive/40 text-destructive text-xs px-3 py-1 font-medium disabled:opacity-50"
                >
                  Suspend user
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
