import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface RootErrorBoundaryState {
  hasError: boolean;
  resetKey: number;
  autoRetryCount: number;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = {
    hasError: false,
    resetKey: 0,
    autoRetryCount: 0,
  };

  static getDerivedStateFromError(): Partial<RootErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(_error: Error) {
    if (this.state.autoRetryCount < 2) {
      this.setState((prev) => ({
        hasError: false,
        resetKey: prev.resetKey + 1,
        autoRetryCount: prev.autoRetryCount + 1,
      }));
    }
  }

  render() {
    if (this.state.hasError && this.state.autoRetryCount >= 2) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] text-slate-100 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full rounded-2xl bg-[#11131a] border border-white/10 p-6 text-center space-y-4">
            <h2 className="text-lg font-bold text-white">Session View Refreshed</h2>
            <p className="text-xs text-slate-400">
              Click below to reload your trading workspace.
            </p>
            <button
              type="button"
              onClick={() =>
                this.setState((prev) => ({
                  hasError: false,
                  resetKey: prev.resetKey + 1,
                  autoRetryCount: 0,
                }))
              }
              className="px-4 py-2.5 rounded-xl bg-[#ff8800] text-slate-950 font-bold text-xs cursor-pointer"
            >
              Restore Workspace
            </button>
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
