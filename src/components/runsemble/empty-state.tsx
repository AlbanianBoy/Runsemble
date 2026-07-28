import type { ReactNode } from 'react'

// ─── EmptyState ───────────────────────────────────────────────────────────────
// One premium treatment for every "nothing here yet" moment. Cold start is the
// #1 churn risk for this app — a blank screen reads as broken or dead, so each
// empty state gets a soft teal icon badge, a warm line, and (where there is one)
// the single next-best action, never a dead end. Kept calm and honest: it says
// "you're early", not "there's nothing".
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className ?? ''}`}>
      <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 ring-1 ring-inset ring-primary/15 [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </div>
      <p className="font-semibold text-[15px] tracking-tight">{title}</p>
      {children ? (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-[280px] leading-relaxed">{children}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
