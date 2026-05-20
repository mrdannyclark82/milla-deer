import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      error,
      retryCount: 0,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard render failed:', error, errorInfo);

    void fetch('/api/client-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack ?? null,
        componentStack: errorInfo.componentStack,
      }),
    }).catch(() => {
      // Keep the fallback visible even if reporting fails.
    });
  }

  private handleRetry = () => {
    this.setState((current) => ({
      error: null,
      retryCount: current.retryCount + 1,
    }));
  };

  override render() {
    if (!this.state.error) {
      return (
        <div key={this.state.retryCount} className="contents">
          {this.props.children}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#050816] px-6 py-10 text-white">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-8 shadow-[0_0_60px_rgba(0,242,255,0.08)]">
          <div className="flex items-center gap-3 text-cyan-100">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              <AlertTriangle className="h-6 w-6 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Dashboard hit a client error</h1>
              <p className="mt-1 text-sm text-slate-300">
                The page failed safely instead of blanking the whole app.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
            <div className="font-medium text-white">What you can do</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Retry the dashboard render</li>
              <li>Refresh the page if the issue persists</li>
              <li>Check recent server/client changes if this started after an update</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
            <div className="font-medium">Last error</div>
            <div className="mt-2 break-words text-rose-50/90">
              {this.state.error.message || 'Unknown client error'}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-200"
            >
              <RefreshCw className="h-4 w-4" />
              Retry dashboard
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 transition hover:border-cyan-400/30 hover:bg-slate-900"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
