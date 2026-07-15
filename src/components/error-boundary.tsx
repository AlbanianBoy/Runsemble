'use client'

import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: '', stack: '' }

  static getDerivedStateFromError(error: unknown) {
    const e = error instanceof Error ? error : new Error(String(error))
    return { hasError: true, message: e.message, stack: e.stack ?? '' }
  }

  componentDidCatch(error: unknown) {
    console.error('App error boundary caught:', error)
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-background text-foreground">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            The app hit an unexpected error. Reloading usually fixes it — your data is safe.
          </p>
          {/* DEBUG: show real error so we can diagnose — remove before release */}
          <div className="w-full max-w-sm text-left bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-red-700 dark:text-red-300 break-words">{this.state.message}</p>
            <pre className="text-[10px] text-red-600 dark:text-red-400 overflow-auto max-h-48 whitespace-pre-wrap break-all">{this.state.stack}</pre>
          </div>
          <button
            onClick={this.handleReload}
            className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold active:scale-95 transition-transform"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
