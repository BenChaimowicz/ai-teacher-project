/** Copy for a `429` when the API sends no text of its own. */
export const TOO_MANY_TRIES = "Too many tries for now. Wait a minute and try again.";

/**
 * A non-2xx reply from our API. `message` is what the person should read: the server's `error` text, or the
 * caller's fallback when there was none.
 */
export class ApiError extends Error {
  /** The HTTP status, e.g. `401`. */
  readonly status: number;
  /** The server's machine-readable `code`, e.g. `email_not_confirmed`, when it sent one. */
  readonly code: string | null;
  /** The server's own `error` text, when it sent one. */
  readonly serverMessage: string | null;

  /**
   * @param status - HTTP status
   * @param code - The body's `code`, or null
   * @param serverMessage - The body's `error`, or null
   * @param fallback - Copy for `message` when the server sent no `error`
   */
  constructor(status: number, code: string | null, serverMessage: string | null, fallback: string) {
    super(serverMessage ?? (status === 429 ? TOO_MANY_TRIES : fallback));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

/** Called when the API says the session is gone; the auth provider sets it. */
let onUnauthorized: (() => void) | null = null;

/**
 * Sets what happens when an API call comes back `401`: the auth provider marks the person signed out, and the route
 * guard sends them to sign-in and back here after.
 * @param handler - Runs on each such `401`
 * @returns A cleanup that removes the handler
 */
export function setUnauthorizedHandler(handler: () => void): () => void {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = null;
  };
}

/**
 * True when a `401` from this path means "the session is gone". Under `/api/auth/`, a `401` means a wrong password
 * or code instead, except on `/api/auth/password`, which needs a session like any other signed-in call.
 * @param url - API path
 */
function meansSignedOut(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return !path.startsWith("/api/auth/") || path === "/api/auth/password";
}

/**
 * `fetch` for our API. The session travels in the `kn_at` / `kn_rt` httpOnly cookies the API sets (ADR 0027); a
 * same-origin request sends them by itself, so nothing is added here.
 * On a `401` from a signed-in call it tells the auth provider, which sends the person to sign-in and back after.
 * Every `/api` call in the web app goes through this (or `requestJson`, which uses it).
 * @param url - API path, e.g. `/api/library`
 * @param init - The usual fetch options
 * @param options - `signOutOn401: false` for a call whose `401` the caller handles itself (the auth provider's probe)
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
  { signOutOn401 = true }: { signOutOn401?: boolean } = {},
): Promise<Response> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  if (response.status === 401 && signOutOn401 && meansSignedOut(url)) onUnauthorized?.();
  return response;
}

/**
 * Sends JSON to the API and returns the parsed body (null for an empty reply, e.g. `204`).
 * Non-2xx responses throw an {@link ApiError} carrying the server's error copy, or `fallback` when it sent none.
 * @param url - API path
 * @param method - HTTP method
 * @param body - Optional JSON body
 * @param fallback - Error copy when the server sends none
 * @throws ApiError on a non-2xx reply; the fetch's own error when the API can't be reached
 */
export async function requestJson<T>(url: string, method: string, body: object | undefined, fallback: string): Promise<T> {
  const response = await apiFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    const serverMessage = typeof record.error === "string" && record.error ? record.error : null;
    const code = typeof record.code === "string" ? record.code : null;
    throw new ApiError(response.status, code, serverMessage, fallback);
  }
  return json as T;
}
