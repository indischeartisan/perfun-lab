import { Component, type ReactNode } from 'react'

/** Handles a failed on-demand customer route without affecting parent app state. */
export class CustomerRouteLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <div className="screen-empty" role="alert"><h2>Page unavailable</h2><p>This page could not be loaded. Check your connection and try again.</p><button onClick={() => window.location.reload()}>Reload page</button></div>
    }
    return this.props.children
  }
}
