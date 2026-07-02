'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

// Segmented light/dark switch. The visual state is driven purely by the `.dark`
// class on <html> (via CSS variants), so there's no hydration-sensitive JS read
// and no mount effect — the current theme is only read inside the click handler.
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="relative flex items-center gap-1 rounded-full bg-muted p-1 w-[76px]"
      aria-label="Toggle dark mode"
    >
      <span className="absolute top-1 bottom-1 left-1 w-9 rounded-full bg-card shadow-sm transition-[left] duration-300 dark:left-[calc(100%-2.5rem)]" />
      <span className="relative z-10 flex-1 flex justify-center"><Sun className="h-4 w-4 text-amber-500 dark:text-muted-foreground" /></span>
      <span className="relative z-10 flex-1 flex justify-center"><Moon className="h-4 w-4 text-muted-foreground dark:text-primary" /></span>
    </button>
  )
}
