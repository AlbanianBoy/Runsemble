// ─── /admin — the ops dashboard ───────────────────────────────────────────────
// A plain server-rendered page for whoever runs the pilot: reports & blocks,
// this week's vital signs, and recent signups. Access is limited to the
// session accounts listed in ADMIN_EMAILS (comma-separated, in .env).
// Deliberately utilitarian — this is a founder tool, not product UI.

import { getAdminUser } from '@/lib/admin'
import { db } from '@/lib/db'
import { ReportQueue, type AdminReport } from '@/components/admin/report-queue'

export const metadata = {
  title: 'Runsemble — Ops',
  robots: { index: false, follow: false },
}

function weekStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
  return d
}

function fmt(d: Date): string {
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default async function AdminPage() {
  const user = await getAdminUser()

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold">Not authorized</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This page is for Runsemble operators. Log in with an admin account
            (listed in ADMIN_EMAILS) and try again.
          </p>
        </div>
      </main>
    )
  }

  const since = weekStart()
  const [openReports, blockCount, totalUsers, signupsWeek, runsWeek, checkinsWeek, postsWeek, recentUsers] =
    await Promise.all([
      // The queue: everything not yet closed, newest first.
      db.report.findMany({
        where: { status: { in: ['open', 'reviewing'] } },
        include: { reporter: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.block.count(),
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: since } } }),
      db.runSession.count({ where: { endedAt: { gte: since } } }),
      db.hotspotParticipant.count({ where: { checkedInAt: { gte: since } } }),
      db.feedPost.count({ where: { createdAt: { gte: since } } }),
      db.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, email: true, createdAt: true, consentAt: true },
      }),
    ])

  // How many distinct reports each subject has — many reporters on one subject is
  // the signal worth surfacing. Counted across ALL statuses, not just open ones.
  const subjectCounts = await db.report.groupBy({
    by: ['subjectType', 'subjectId'],
    _count: { _all: true },
    where: { subjectId: { in: openReports.map((r) => r.subjectId) } },
  })
  const countKey = (t: string, id: string) => `${t}:${id}`
  const countBySubject = new Map(
    subjectCounts.map((c) => [countKey(c.subjectType, c.subjectId), c._count._all])
  )

  const reports: AdminReport[] = openReports.map((r) => ({
    id: r.id,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    reason: r.reason,
    details: r.details,
    evidence: r.evidence,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reporterName: r.reporter.name,
    reporterEmail: r.reporter.email,
    subjectReportCount: countBySubject.get(countKey(r.subjectType, r.subjectId)) ?? 1,
  }))

  const stats = [
    { label: 'Total users', value: totalUsers },
    { label: 'Signups this week', value: signupsWeek },
    { label: 'Runs this week', value: runsWeek },
    { label: 'Check-ins this week', value: checkinsWeek },
    { label: 'Posts this week', value: postsWeek },
  ]

  return (
    <main className="min-h-screen bg-background text-foreground p-6 max-w-3xl mx-auto space-y-8">
      <header className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Runsemble <span className="text-primary">Ops</span>
        </h1>
        <p className="text-xs text-muted-foreground">signed in as {user.email}</p>
      </header>

      {/* Vital signs since Monday */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-3">
            <p className="text-2xl font-bold tabular-nums">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Moderation queue — open reports an operator needs to action */}
      <section>
        <h2 className="font-semibold mb-2">
          Moderation queue <span className="text-muted-foreground font-normal">({reports.length})</span>
        </h2>
        <ReportQueue reports={reports} />
        <p className="text-xs text-muted-foreground mt-2">
          {blockCount} block{blockCount === 1 ? '' : 's'} in total. Blocking hides a pair from
          each other; a report is what reaches this queue.
        </p>
      </section>

      {/* Recent signups */}
      <section>
        <h2 className="font-semibold mb-2">Recent signups</h2>
        <div className="rounded-xl border divide-y">
          {recentUsers.map((u) => (
            <div key={u.id} className="p-3 text-sm flex items-baseline justify-between gap-3 flex-wrap">
              <span>
                <span className="font-medium">{u.name}</span>{' '}
                <span className="text-muted-foreground">{u.email}</span>
                {!u.consentAt && (
                  <span className="ml-2 text-[11px] text-amber-600">pre-auth profile</span>
                )}
              </span>
              <span className="text-[11px] text-muted-foreground/70">{fmt(u.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
