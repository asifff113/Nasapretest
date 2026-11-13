// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorPanel } from './LoadState';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('CaseFile Earth: a screen failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
          <ErrorPanel error={this.state.error} />
        </div>
      );
    }
    return this.props.children;
  }
}
