/** A value a query string can carry; empty values are dropped. */
export type QueryValue = string | number | boolean | null | undefined;

/** Query parameters for an `/api/ops/*` route. */
export type QueryParams = Record<string, QueryValue>;

/** Thrown when the console API answers a non-2xx status or cannot be reached. */
export class ApiError extends Error {
  /** HTTP status the API answered. */
  readonly status: number;
  /**
   * @param message - Full formatted message
   * @param status - HTTP status
   */
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Builds a query string, dropping empty values.
 * @param params - Query parameters
 * @returns `?a=1&b=2`, or an empty string
 */
export function buildQuery(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/**
 * One request to an `/api/ops/*` route, without retries.
 * @param method - `GET` or `POST`
 * @param path - Route below `/api/ops/`, e.g. `summary` or `usage-records/abc`
 * @param params - Query parameters
 * @param signal - Abort signal
 * @returns The parsed JSON body
 * @throws ApiError when the API is unreachable, answers non-2xx, or returns non-JSON
 */
async function opsFetchOnce<T>(method: "GET" | "POST", path: string, params?: QueryParams, signal?: AbortSignal): Promise<T> {
  const url = `/api/ops/${path}${buildQuery(params)}`;
  const where = method === "GET" ? "opsGet" : "opsPost";
  const headers: Record<string, string> = { accept: "application/json" };

  let response: Response;
  try {
    response = await fetch(url, { method, headers, signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      `[api: ${where}] Console API unreachable — is it running on :3100? || url=${url} || ${(error as Error).message}`,
      0,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(
      `[api: ${where}] Request failed || url=${url} || status=${response.status} ${body.slice(0, 300)}`,
      response.status,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiError(`[api: ${where}] Response is not JSON || url=${url} || ${(error as Error).message}`, response.status);
  }
}

/** Waits before each retry; the console API restarts in a few seconds under `tsx watch`. */
const RETRY_DELAYS_MS = [500, 1500, 3000];

/**
 * Whether a failure is worth retrying: the API was unreachable or answered 5xx (Vite's proxy answers 500 while the
 * console API restarts).
 * @param error - The failure
 * @returns True to retry
 */
function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

/**
 * Sleeps, but wakes early (and throws) if the request is aborted.
 * @param ms - Delay
 * @param signal - Abort signal
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * GETs an `/api/ops/*` route, retrying up to 3 times (0.5 s, 1.5 s, 3 s) when the API is unreachable or answers 5xx.
 * @param path - Route below `/api/ops/`, e.g. `summary` or `usage-records/abc`
 * @param params - Query parameters
 * @param signal - Abort signal
 * @returns The parsed JSON body
 * @throws ApiError after the last retry fails, or at once for 4xx / non-JSON
 */
export async function opsGet<T>(path: string, params?: QueryParams, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await opsFetchOnce<T>("GET", path, params, signal);
    } catch (error) {
      if (!isRetryable(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
      await delay(RETRY_DELAYS_MS[attempt], signal);
    }
  }
}

/**
 * POSTs to an `/api/ops/*` action route once (no retries: an action should not silently run twice).
 * @param path - Route below `/api/ops/`, e.g. `billing/refresh`
 * @param params - Query parameters
 * @param signal - Abort signal
 * @returns The parsed JSON body
 * @throws ApiError when the API is unreachable, answers non-2xx, or returns non-JSON
 */
export function opsPost<T>(path: string, params?: QueryParams, signal?: AbortSignal): Promise<T> {
  return opsFetchOnce<T>("POST", path, params, signal);
}
