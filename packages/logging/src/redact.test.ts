import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import pino from "pino";
import { LOG_CONTEXT_MAX_BYTES, LOG_MESSAGE_MAX_BYTES, TRUNCATION_MARKER, type TruncatedContext } from "@senoy/db/logs";
import {
  EMAIL_REPLACEMENT,
  pinoRedactPaths,
  REDACTED,
  redactContext,
  scrubEmails,
  toStorableRow,
  truncateContext,
  truncateMessage,
} from "./redact.ts";
import type { LogEntryRow } from "./types.ts";

/** Redaction and size caps (ADR 0029, spec Q7). */

const UUID = "51aa0f3c-1d2e-4f5a-9b8c-7d6e5f4a3b2c";

test("Emails become [email] wherever they sit in a text", () => {
  assert.equal(scrubEmails("from ben.c+test@mail.example.co.il to a@b.io"), `from ${EMAIL_REPLACEMENT} to ${EMAIL_REPLACEMENT}`);
  assert.equal(scrubEmails("@senoy/db and user@localhost stay"), "@senoy/db and user@localhost stay");
});

test("Secret keys are redacted at any depth and in any case; strings lose their emails", () => {
  const redacted = redactContext({
    Authorization: "Bearer x",
    req: { headers: { cookie: "kn_at=1", "Set-Cookie": ["a"] }, url: "/api/me" },
    deep: { deeper: { deepest: { refresh_token: "r", accessToken: "a", TOKEN: "t", password: "p" } } },
    list: [{ access_token: "a" }, "mail ben@example.com"],
    note: "ben@example.com wrote",
  });
  assert.deepEqual(redacted, {
    Authorization: REDACTED,
    req: { headers: { cookie: REDACTED, "Set-Cookie": REDACTED }, url: "/api/me" },
    deep: { deeper: { deepest: { refresh_token: REDACTED, accessToken: REDACTED, TOKEN: REDACTED, password: REDACTED } } },
    list: [{ access_token: REDACTED }, "mail [email]"],
    note: "[email] wrote",
  });
});

test("code is redacted only inside a body, so error codes stay readable", () => {
  assert.deepEqual(redactContext({ body: { code: "123456", email: "x" }, req: { body: { code: "654321" } }, err: { code: "ECONNRESET" } }), {
    body: { code: REDACTED, email: "x" }, req: { body: { code: REDACTED } }, err: { code: "ECONNRESET" },
  });
});

test("redactContext copies, survives cycles, and turns Errors, Dates and bigints into JSON values", () => {
  const original: Record<string, unknown> = { password: "p", when: new Date("2026-11-04T10:00:00Z"), big: 10n, fn: () => 1 };
  original.self = original;
  const shared = { a: 1 };
  const redacted = redactContext({ ...original, err: new Error("boom"), twice: [shared, shared] }) as Record<string, unknown>;
  assert.equal(original.password, "p", "The input is left alone.");
  assert.equal(redacted.when, "2026-11-04T10:00:00.000Z");
  assert.equal(redacted.big, "10");
  assert.equal("fn" in redacted, false);
  assert.equal((redacted.self as Record<string, unknown>).self, "[Circular]");
  assert.deepEqual(redacted.twice, [{ a: 1 }, { a: 1 }], "The same object twice is not a cycle.");
  assert.equal((redacted.err as Record<string, unknown>).message, "boom");
  assert.equal((redacted.err as Record<string, unknown>).type, "Error");
});

test("A message over 2 KB is cut at a character boundary and marked", () => {
  assert.equal(truncateMessage("short"), "short");
  const long = "א".repeat(LOG_MESSAGE_MAX_BYTES); // 2 bytes each
  const cut = truncateMessage(long);
  assert.ok(Buffer.byteLength(cut) <= LOG_MESSAGE_MAX_BYTES);
  assert.ok(cut.endsWith(TRUNCATION_MARKER));
  assert.ok(!cut.includes("�"), "No character is split.");
});

test("A context over 8 KB becomes a marked preview that itself fits", () => {
  const small = { a: 1 };
  assert.equal(truncateContext(small), small);
  assert.equal(truncateContext(null), null);
  const big = { text: "\"quoted\" ".repeat(3_000) };
  const truncated = truncateContext(big) as TruncatedContext;
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.originalBytes, Buffer.byteLength(JSON.stringify(big)));
  assert.ok(truncated.preview.startsWith("{\"text\":"));
  assert.ok(truncated.preview.endsWith(TRUNCATION_MARKER));
  assert.ok(Buffer.byteLength(JSON.stringify(truncated)) <= LOG_CONTEXT_MAX_BYTES);
});

test("A context JSON cannot encode is replaced, not thrown", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const replaced = truncateContext(cyclic) as TruncatedContext;
  assert.equal(replaced.truncated, true);
  assert.match(replaced.preview, /could not be encoded/);
});

test("toStorableRow nulls ids that are not uuids and keeps them in the context", () => {
  const row: LogEntryRow = {
    loggedAt: new Date(), component: "worker", level: "error", message: "m", context: { a: 1 },
    requestId: UUID, generationJobId: "job-1", courseRequestId: 42 as never, learnerId: null, pipelineEventId: UUID.toUpperCase(),
  };
  const stored = toStorableRow(row);
  assert.equal(stored.requestId, UUID);
  assert.equal(stored.generationJobId, null);
  assert.equal(stored.courseRequestId, null);
  assert.equal(stored.pipelineEventId, UUID.toUpperCase());
  assert.deepEqual(stored.context, { a: 1, invalidIds: { generationJobId: "job-1", courseRequestId: 42 } });
});

test("toStorableRow never throws, even on a bad date or a hostile context", () => {
  const hostile = Object.defineProperty({}, "boom", { enumerable: true, get() {
    throw new Error("getter");
  } });
  const stored = toStorableRow({
    loggedAt: new Date(Number.NaN), component: "api", level: "info", message: undefined as never, context: hostile,
    requestId: null, generationJobId: null, courseRequestId: null, learnerId: null, pipelineEventId: null,
  });
  assert.ok(!Number.isNaN(stored.loggedAt.getTime()));
  assert.equal(typeof stored.message, "string");
});

test("Pino's redact paths hide the same keys on stdout", () => {
  const lines: string[] = [];
  const out = new Writable({ write(chunk, _encoding, done) {
    lines.push(String(chunk));
    done();
  } });
  const log = pino({ redact: { paths: pinoRedactPaths(), censor: REDACTED } }, out);
  log.info({
    token: "t", "set-cookie": "s",
    req: { headers: { authorization: "Bearer x", cookie: "c", "set-cookie": "s", host: "h" }, body: { code: "123456" } },
    res: { headers: { "set-cookie": "s" } },
    body: { code: "1", other: "kept" },
    err: { code: "ECONNRESET", details: { password: "p" } },
  }, "hello");
  const line = JSON.parse(lines[0]!);
  assert.equal(line.token, REDACTED);
  assert.equal(line["set-cookie"], REDACTED);
  assert.deepEqual(line.req.headers, { authorization: REDACTED, cookie: REDACTED, "set-cookie": REDACTED, host: "h" });
  assert.equal(line.req.body.code, REDACTED);
  assert.equal(line.res.headers["set-cookie"], REDACTED);
  assert.deepEqual(line.body, { code: REDACTED, other: "kept" });
  assert.equal(line.err.code, "ECONNRESET");
  assert.equal(line.err.details.password, REDACTED);
});

test("toStorableRow removes NUL characters from the message, context strings and keys, so Postgres takes the batch", () => {
  const row = toStorableRow({
    loggedAt: new Date(),
    component: "web",
    level: "error",
    message: "boom\u0000",
    context: { "ke\u0000y": "va\u0000lue", nested: ["a\u0000"] },
    requestId: null,
    generationJobId: null,
    courseRequestId: null,
    learnerId: null,
    pipelineEventId: null,
  } as LogEntryRow);
  assert.equal(row.message, "boom");
  assert.deepEqual(row.context, { key: "value", nested: ["a"] });
  assert.equal(JSON.stringify(row).includes("\\u0000"), false);
});
