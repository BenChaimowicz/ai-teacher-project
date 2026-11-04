import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { ErrorState } from "@/components/States";
import { reportBoundaryError, startClientLog } from "@/lib/client-log";
import "@/index.css";

type ConsoleErrorBoundaryState = { error: Error | null };

/**
 * The console's last line: a render error anywhere below it goes to the client logs as `error_boundary` (ADR 0029),
 * and the page shows the error with a reload instead of going blank.
 */
class ConsoleErrorBoundary extends Component<{ children: ReactNode }, ConsoleErrorBoundaryState> {
  state: ConsoleErrorBoundaryState = { error: null };

  /**
   * Switches to the fallback after a render error.
   * @param error - What was thrown
   */
  static getDerivedStateFromError(error: unknown): ConsoleErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  /**
   * Reports the error and React's component stack.
   * @param error - What was thrown
   * @param info - React's component stack
   */
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportBoundaryError(error, info.componentStack);
  }

  /** The console, or the error with a reload after a crash. */
  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <ErrorState error={this.state.error} onRetry={() => window.location.reload()} />;
  }
}

startClientLog();

const root = document.getElementById("root");
if (!root) throw new Error("[main: bootstrap] Missing #root element || id=root || index.html changed?");

createRoot(root).render(
  <StrictMode>
    <ConsoleErrorBoundary>
      <App />
    </ConsoleErrorBoundary>
  </StrictMode>,
);
