import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches React render errors so a single component bug doesn't blank the entire shell.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg p-8 text-center">
          <div className="text-lg font-semibold text-danger">Something broke in the UI</div>
          <pre className="max-h-48 max-w-xl overflow-auto rounded-lg border border-border-soft bg-bg-soft p-3 text-left text-xs text-fg-muted">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-lg border border-border-soft bg-bg-elevated px-4 py-2 text-sm font-medium text-fg hover:bg-bg-hover"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
