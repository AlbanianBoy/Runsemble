// ─── /admin — the ops dashboard ───────────────────────────────────────────────
// A plain server-rendered page for whoever runs the pilot: reports & blocks,
// this week's vital signs, and recent signups. Access is limited to the
// session accounts listed in ADMIN_EMAILS (comma-separated, in .env).
// Deliberately utilitarian — this is a founder tool, not product UI.

import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

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
  const user = await getSessionUser()
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const isAdmin = !!user && admins.includes(user.email.toLowerCase())

  if (!isAdmin) {
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
  const [blocks, totalUsers, signupsWeek, runsWeek, checkinsWeek, postsWeek, recentUsers] =
    await Promise.all([
      db.block.findMany({
        include: {
          blocker: { select: { name: true, email: true } },
          blocked: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
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

  const reports = blocks.filter((b) => b.reason)
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

      {/* Reports — blocks that came with a reason */}
      <section>
        <h2 className="font-semibold mb-2">
          Reports <span className="text-muted-foreground font-normal">({reports.length})</span>
        </h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4">
            No reports. Quiet is good.
          </p>
        ) : (
          <div className="rounded-xl border divide-y">
            {reports.map((b) => (
              <div key={b.id} className="p-3 text-sm">
                <p>
                  <span className="font-medium">{b.blocker.name}</span>
                  <span className="text-muted-foreground"> ({b.blocker.email}) reported </span>
                  <span className="font-medium">{b.blocked.name}</span>
                  <span className="text-muted-foreground"> ({b.blocked.email})</span>
                </p>
                <p className="text-muted-foreground mt-1">“{b.reason}”</p>
                <p className="text-[11px] text-muted-foreground/70 mt-1">{fmt(b.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Plus {blocks.length - reports.length} block{blocks.length - reports.length === 1 ? '' : 's'} without a
          reason. Blocked pairs can’t see or message each other.
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
