import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isStalePage, reloadForUpdate } from '../lib/staleReload'

// When something in the app breaks: a page saying so, that the story is
// saved, and how to carry on (with what went wrong, to report), in place of
// a blank page. A page left open across a new version, whose parts have
// moved, gets the new version instead (see lib/staleReload).

interface State {
  error: Error | null
  copied: boolean
}

export class CrashScreen extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
    if (isStalePage(error)) reloadForUpdate()
  }

  private details(): string {
    const { error } = this.state
    return [
      `${error?.name ?? 'Error'}: ${error?.message ?? ''}`,
      ...(error?.stack?.split('\n').slice(1, 8) ?? []),
      `Page: ${location.hash || '#/'}`,
      `Version: ${__BUILD_ID__}`,
      `Browser: ${navigator.userAgent}`,
    ].join('\n')
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(this.details())
      this.setState({ copied: true })
    } catch {
      // (The details are on the page to copy by hand.)
    }
  }

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>
          Arc Creator ran into a problem it couldn’t get past. Your story is saved in this browser, and in your account if you’re signed in, so
          reloading the page should bring you back to it.
        </p>
        <div className="crash-actions">
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              location.hash = '#/'
              location.reload()
            }}
          >
            Go to the chapter board
          </button>
        </div>
        <details className="crash-details">
          <summary>What went wrong (to report it)</summary>
          <pre>{this.details()}</pre>
          <button className="btn ghost small" onClick={() => void this.copy()}>
            {copied ? 'Copied' : 'Copy the details'}
          </button>
        </details>
      </main>
    )
  }
}
