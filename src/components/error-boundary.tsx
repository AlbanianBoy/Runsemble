'use client'

import { Component, type ReactNode } from 'react'

// A crash in any child component would otherwise white-screen the whole app.
// This catches it and shows a friendly reload screen instead — cheap insurance
// against a single stray runtime error bricking the app for a real user.
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
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
