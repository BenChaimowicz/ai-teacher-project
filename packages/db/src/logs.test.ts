import assert from "node:assert/strict";
import { test } from "node:test";
import { clientLogLevel, LOG_LEVELS, logLevelOf, PINO_LEVEL_NUMBERS } from "./logs.ts";

test("Only info and above are stored: debug and trace map to nothing, levels in between round down", () => {
  assert.equal(logLevelOf(10), null);
  assert.equal(logLevelOf(20), null);
  assert.equal(logLevelOf(30), "info");
  assert.equal(logLevelOf(35), "info");
  assert.equal(logLevelOf(40), "warn");
  assert.equal(logLevelOf(50), "error");
  assert.equal(logLevelOf(60), "fatal");
});

test("The level list is ordered least serious first, as Postgres compares the enum", () => {
  const numbers = LOG_LEVELS.map((level) => PINO_LEVEL_NUMBERS[level]);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
});

test("A browser event's level is set by the server: a call with no reply is a warn, everything else an error", () => {
  assert.equal(clientLogLevel({ kind: "api_failure", api: { method: "GET", path: "/api/me", status: 0, requestId: null } }), "warn");
  assert.equal(clientLogLevel({ kind: "api_failure", api: { method: "GET", path: "/api/me", status: 502, requestId: null } }), "error");
  assert.equal(clientLogLevel({ kind: "uncaught_error" }), "error");
  assert.equal(clientLogLevel({ kind: "error_boundary", api: null }), "error");
});
