import { createClientLogShipper, errorDetails, installClientLogHandlers } from "@senoy/logging/client";

/**
 * The Usage Console's own browser errors (ADR 0029): uncaught errors, unhandled rejections and error-boundary catches
 * go to the console's own server, `POST /api/ops/client-logs`, where they become Log Entries of component `console`.
 * No failed API calls: the API that fails is the server these would go to.
 */

/** Where the console's browser errors go. */
export const CLIENT_LOG_ENDPOINT = "/api/ops/client-logs";

/** The console's one shipper. */
const shipper = createClientLogShipper({ endpoint: CLIENT_LOG_ENDPOINT });

/** Set once the `window` handlers are on, so a second call (a hot reload) adds none. */
let installed = false;

/** Starts reporting uncaught errors and unhandled rejections, and flushing when the page is hidden. Call before render. */
export function startClientLog(): void {
  if (installed) return;
  installed = true;
  installClientLogHandlers(shipper, window);
}

/**
 * Reports a render error an error boundary caught.
 * @param error - What was thrown
 * @param componentStack - React's component stack, when it gave one
 */
export function reportBoundaryError(error: unknown, componentStack: string | null | undefined): void {
  const details = errorDetails(error);
  shipper.report({ kind: "error_boundary", message: details.message, stack: details.stack, componentStack: componentStack ?? null });
}
