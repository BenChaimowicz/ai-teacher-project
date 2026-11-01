import { supabase } from "@/lib/supabase.ts";

/**
 * `fetch` for our API. Adds `Authorization: Bearer <access token>` from the current Supabase session (ADR 0026).
 * On a 401 it drops the local session, which sends the person to sign-in and back here after.
 * Every `/api` call in the web app goes through this (or `requestJson`, which uses it).
 * @param url - API path, e.g. `/api/library`
 * @param init - The usual fetch options
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && token) {
    // The API refused the token (expired, revoked by "sign out everywhere"). Signing out here flips the auth
    // state, and the route guard sends the person to /sign-in, remembering where they were.
    void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  return response;
}

/**
 * Sends JSON to the API and returns the parsed body. Non-2xx responses throw with the server's error copy.
 * @param url - API path
 * @param method - HTTP method
 * @param body - Optional JSON body
 * @param fallback - Error copy when the server sends none
 */
export async function requestJson<T>(url: string, method: string, body: object | undefined, fallback: string): Promise<T> {
  const response = await apiFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json ? String((json as { error: unknown }).error) : fallback;
    throw new Error(message);
  }
  return json as T;
}
