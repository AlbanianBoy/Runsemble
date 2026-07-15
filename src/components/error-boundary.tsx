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
