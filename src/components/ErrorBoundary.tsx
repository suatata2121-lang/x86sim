import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** A new value (e.g. another topic) clears a caught error. */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

// Without a boundary one throwing view unmounts the whole app: the page goes
// blank and students reload or reopen the tab, which loses their place and,
// in a new tab, their session (#86). This keeps the failure to one panel.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View crashed:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="panel view-error" role="alert">
        <p>Something went wrong in this view.</p>
        <button className="primary" onClick={() => this.setState({ error: null })}>Reload it</button>
      </div>
    )
  }
}
