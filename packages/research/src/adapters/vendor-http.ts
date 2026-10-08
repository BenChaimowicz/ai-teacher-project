/**
 * Reads a vendor response as JSON, or throws with the status and the start of the body.
 * Never includes request headers, so API keys cannot leak into the message.
 * @param response - fetch response
 * @param where - `[file: function]` prefix for the error
 * @returns Parsed JSON body
 */
export async function readVendorJson(response: Response, where: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${where} Vendor returned an error || status=${response.status} || ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${where} Vendor returned invalid JSON || status=${response.status} || ${message}`);
  }
}

/**
 * Non-empty, trimmed strings from an unknown array; anything else is dropped.
 * @param raw - Unknown JSON value
 */
export function stringList(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

/**
 * A trimmed non-empty string, or null.
 * @param raw - Unknown JSON value
 */
export function optionalString(raw: unknown) {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}
