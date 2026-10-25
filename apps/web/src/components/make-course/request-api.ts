import { requestJson } from "@/lib/api.ts";
import type { CourseRequestRecord } from "@/lib/course-request-types.ts";

/** What every Course Request action returns, plus whatever else the route sends. */
export type RequestReply<Extra = object> = { courseRequest: CourseRequestRecord } & Extra;

/** Fired whenever an action returns a newer Request, so the screen showing it updates even after a remount. */
const EVENT = "mk:course-request";

/**
 * Sends one Course Request action and announces the returned Request.
 * @param path - Path after `/api/course-requests`, e.g. `/abc/validity`
 * @param method - HTTP method
 * @param body - JSON body
 * @param fallback - Error copy when the server sends none
 * @throws Error with the server's plain-language message
 */
export async function requestAction<Extra = object>(path: string, method: string, body: object | undefined, fallback: string) {
  const reply = await requestJson<RequestReply<Extra>>(`/api/course-requests${path}`, method, body, fallback);
  if (reply?.courseRequest) announceRequest(reply.courseRequest);
  return reply;
}

/** Tells listeners a Request changed. */
export function announceRequest(record: CourseRequestRecord) {
  window.dispatchEvent(new CustomEvent<CourseRequestRecord>(EVENT, { detail: record }));
}

/**
 * Listens for changes to Requests.
 * @param listener - Called with each newer Request
 * @returns Unsubscribe
 */
export function onRequestChange(listener: (record: CourseRequestRecord) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<CourseRequestRecord>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** The message of a caught error, or a fallback. */
export function errorText(caught: unknown, fallback = "Something went wrong. Please try again.") {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
