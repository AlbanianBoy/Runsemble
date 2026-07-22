'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

// Segmented light/dark switch. The visual state is driven purely by the `.dark`
// class on <html> (via CSS variants), so there's no hydration-sensitive JS read
// and no mount effect — the current theme is only read inside the click handler.
// "Have we hydrated yet" without setting state in an effect, which the React
// Compiler lint rightly rejects as a cascading render. The store never changes:
// the server snapshot is false, the client's is true, and the switch from one to
// the other IS hydration.
const subscribeNever = () => () => {}

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()

  // The visual state stays CSS-driven so there is no flash on load, but a
  // screen reader was told only "Toggle dark mode" with no indication of which
  // way it currently sits — the sliding knob says it to everyone except the
  // people who most need it said. aria-checked needs the resolved theme, which
  // is not known until after hydration, so it is announced from mount onward
  // rather than guessed during SSR.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false)
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative flex items-center gap-1 rounded-full bg-muted p-1 w-[76px] min-h-11"
      role="switch"
      aria-checked={mounted ? isDark : undefined}
      aria-label="Dark mode"
    >
      <span className="absolute top-1 bottom-1 left-1 w-9 rounded-full bg-card shadow-sm transition-[left] duration-300 dark:left-[calc(100%-2.5rem)]" />
      <span className="relative z-10 flex-1 flex justify-center"><Sun className="h-4 w-4 text-amber-500 dark:text-muted-foreground" /></span>
      <span className="relative z-10 flex-1 flex justify-center"><Moon className="h-4 w-4 text-muted-foreground dark:text-primary" /></span>
    </button>
  )
}
