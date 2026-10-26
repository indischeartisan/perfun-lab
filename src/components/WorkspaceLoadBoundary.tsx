import { Component, type ReactNode } from 'react'

export class WorkspaceLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <div className="screen-empty" role="alert"><h2>Workspace unavailable</h2><p>The workspace could not be loaded. Check your connection and try again.</p><button onClick={() => window.location.reload()}>Reload workspace</button></div>
    }
    return this.props.children
  }
}
