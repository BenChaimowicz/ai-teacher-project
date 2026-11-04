import { createClientLogShipper, errorDetails, installClientLogHandlers, pathOnly } from "@senoy/logging/client";

/**
 * The web app's client logs (ADR 0029): uncaught errors, unhandled rejections, error-boundary catches and failed API
 * calls go to `POST /api/client-logs`, where they become Log Entries of component `web`. Nothing else is sent.
 */

/** Where the web app's browser events go. */
export const CLIENT_LOG_ENDPOINT = "/api/client-logs";

/** The web app's one shipper. */
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

/**
 * Reports an API call that answered 500 or more, or got no reply (`status` 0). A call to the client-log route itself
 * is never reported, so a failing log route cannot feed itself.
 * @param call.method - The call's method; GET when the caller set none
 * @param call.url - The URL it called; only its path is kept
 * @param call.status - The reply's status, or 0
 * @param call.requestId - The reply's `x-request-id`, or null
 */
export function reportApiFailure(call: { method: string | undefined; url: string; status: number; requestId: string | null }): void {
  const path = pathOnly(call.url);
  if (path === CLIENT_LOG_ENDPOINT) return;
  const method = (call.method ?? "GET").toUpperCase();
  shipper.report({
    kind: "api_failure",
    message: `${method} ${path} failed: ${call.status === 0 ? "no reply" : call.status}`,
    api: { method, path, status: call.status, requestId: call.requestId },
  });
}
