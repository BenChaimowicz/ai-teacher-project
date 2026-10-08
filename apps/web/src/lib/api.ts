/**
 * Sends JSON to the API and returns the parsed body. Non-2xx responses throw with the server's error copy.
 * @param url - API path
 * @param method - HTTP method
 * @param body - Optional JSON body
 * @param fallback - Error copy when the server sends none
 */
export async function requestJson<T>(url: string, method: string, body: object | undefined, fallback: string): Promise<T> {
  const response = await fetch(url, {
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
