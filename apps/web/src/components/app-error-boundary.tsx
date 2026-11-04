import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportBoundaryError } from "@/lib/client-log.ts";

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { failed: boolean };

/**
 * The web app's last line: a render error anywhere below it is sent to the client logs as `error_boundary` (ADR 0029)
 * and the page shows a plain "reload" screen instead of going blank. The fallback uses no companion art, router or
 * provider, so it cannot fail the same way the app did. It only shows after a crash, so no working screen changes.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  /** Switches to the fallback after a render error. */
  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  /**
   * Reports the error and React's component stack.
   * @param error - What was thrown
   * @param info - React's component stack
   */
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportBoundaryError(error, info.componentStack);
  }

  /** The app, or the fallback after a crash. */
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="k-state error" role="alert">
          <h3>Something broke on this page</h3>
          <p>We've noted it. Reload to pick up where you were.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" className="k-btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </main>
    );
  }
}
