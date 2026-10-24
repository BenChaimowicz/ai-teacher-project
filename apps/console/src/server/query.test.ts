import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseBucket,
  parseApiRequestQuery,
  parsePage,
  parseRange,
  previousRange,
  QueryError,
} from "./query.ts";

const NOW = new Date("2026-10-24T12:00:00.000Z");

describe("parseRange", () => {
  it("defaults to the last seven days", () => {
    assert.deepEqual(parseRange({}, NOW), { from: "2026-10-17T12:00:00.000Z", to: "2026-10-24T12:00:00.000Z" });
  });

  it("measures seven days back from a given to", () => {
    assert.deepEqual(parseRange({ to: "2026-10-10" }, NOW), {
      from: "2026-10-03T00:00:00.000Z",
      to: "2026-10-10T00:00:00.000Z",
    });
  });

  it("accepts offsets and normalises to UTC", () => {
    assert.equal(parseRange({ from: "2026-10-24T03:00:00+03:00" }, NOW).from, "2026-10-24T00:00:00.000Z");
  });

  it("rejects garbage and empty or inverted ranges", () => {
    assert.throws(() => parseRange({ from: "last week" }, NOW), QueryError);
    assert.throws(() => parseRange({ from: "2026-13-40" }, NOW), QueryError);
    assert.throws(() => parseRange({ from: "2026-10-24T12:00:00Z" }, NOW), QueryError);
    assert.throws(() => parseRange({ from: ["2026-10-01", "2026-10-02"] }, NOW), QueryError);
  });
});

describe("previousRange and chooseBucket", () => {
  it("previous range has the same length and ends where this one starts", () => {
    assert.deepEqual(previousRange({ from: "2026-10-17T00:00:00.000Z", to: "2026-10-24T00:00:00.000Z" }), {
      from: "2026-10-10T00:00:00.000Z",
      to: "2026-10-17T00:00:00.000Z",
    });
  });

  it("charts per hour up to 48 hours, per day beyond", () => {
    assert.equal(chooseBucket({ from: "2026-10-22T12:00:00.000Z", to: "2026-10-24T12:00:00.000Z" }), "hour");
    assert.equal(chooseBucket({ from: "2026-10-22T11:59:59.000Z", to: "2026-10-24T12:00:00.000Z" }), "day");
    assert.equal(chooseBucket({ from: "2026-10-17T12:00:00.000Z", to: "2026-10-24T12:00:00.000Z" }), "day");
  });
});

describe("parsePage", () => {
  it("defaults to 50 from 0 and clamps at 500", () => {
    assert.deepEqual(parsePage({}), { limit: 50, offset: 0 });
    assert.deepEqual(parsePage({ limit: "501", offset: "20" }), { limit: 500, offset: 20 });
  });

  it("rejects non-integers and zero", () => {
    assert.throws(() => parsePage({ limit: "0" }), QueryError);
    assert.throws(() => parsePage({ limit: "2.5" }), QueryError);
    assert.throws(() => parsePage({ offset: "-3" }), QueryError);
  });
});

describe("parseApiRequestQuery", () => {
  it("reads errorsOnly as a flag", () => {
    assert.equal(parseApiRequestQuery({ errorsOnly: "true" }, NOW).errorsOnly, true);
    assert.equal(parseApiRequestQuery({ errorsOnly: "0" }, NOW).errorsOnly, false);
    assert.equal(parseApiRequestQuery({}, NOW).errorsOnly, false);
  });
});
