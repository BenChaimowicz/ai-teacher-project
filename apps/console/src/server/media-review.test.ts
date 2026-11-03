import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { MediaStorage } from "@senoy/media";
import { buildConsoleApp } from "./app.ts";
import { createMediaReviewService, toMediaReviewItem, type MediaReviewService } from "./media-review.ts";
import type { OpsStore } from "./ops-store.ts";
import type { SqlRow } from "./format.ts";

const ID = "0b8c2a52-7a52-4c3e-9a3c-2f1e5b0d9a11";
const dialect = new PgDialect();

/** One `media_descriptors` row as the console's queries select it. */
const ROW: SqlRow = {
  id: ID, review: "unreviewed", caption: "French grip.", alt: "A hand.", license: "cc_by", licenseUrl: "https://creativecommons.org/licenses/by/2.5",
  source: { title: "File:French grip right hand 01.jpg", author: "Uryah", url: "https://commons.wikimedia.org/wiki/File:French_grip_right_hand_01.jpg" },
  mediaCategory: "drum-grip", topicTags: ["french-grip"], mimeType: "image/jpeg", width: 600, height: 449,
  createdAt: "2026-11-03 18:00:00+00", lessonCount: "2",
};

/**
 * A runner that keeps each statement and answers with `rows`.
 * @param rows - What every query returns
 */
function fakeRunner(rows: SqlRow[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const run = async (query: SQL) => {
    queries.push(dialect.sqlToQuery(query));
    return rows;
  };
  return { run, queries };
}

describe("Media review service", () => {
  it("lists only Commons files, unreviewed apart from decided, with how many Lessons show each", async () => {
    const { run, queries } = fakeRunner([ROW]);
    const list = await createMediaReviewService({ run, storage: null }).list();
    assert.equal(list.unreviewed[0]!.lessonCount, 2);
    assert.equal(list.unreviewed[0]!.source!.author, "Uryah");
    assert.equal(list.unreviewed[0]!.createdAt, "2026-11-03T18:00:00.000Z");
    assert.ok(queries.every(({ params }) => params.includes("library/commons/%")), "Seeded files are never listed.");
    assert.match(queries[0]!.sql, /review = 'unreviewed'/);
    assert.match(queries[1]!.sql, /review <> 'unreviewed'/);
  });

  it("saves a decision only on a Commons file and never deletes the row or its bytes", async () => {
    const { run, queries } = fakeRunner([{ ...ROW, review: "removed" }]);
    const item = await createMediaReviewService({ run, storage: null }).decide(ID, "removed");
    assert.equal(item!.review, "removed");
    assert.match(queries[0]!.sql, /^update media_descriptors d set review = \$1::media_review/);
    assert.doesNotMatch(queries[0]!.sql, /delete/i);
    assert.deepEqual(queries[0]!.params.slice(0, 2), ["removed", ID]);
  });

  it("reads a thumbnail from the bucket, and none without bucket keys", async () => {
    const storage: MediaStorage = {
      put: async () => {}, head: async () => null,
      get: async (key) => ({ body: Readable.from([Buffer.from(key)]), contentType: "image/jpeg", byteSize: key.length }),
    };
    const { run } = fakeRunner([{ storageKey: "library/commons/abc.jpg" }]);
    assert.equal((await createMediaReviewService({ run, storage }).file(ID))!.contentType, "image/jpeg");
    assert.equal(await createMediaReviewService({ run, storage: null }).file(ID), null);
  });
});

describe("Media review routes", () => {
  const json = { "content-type": "application/json", host: "127.0.0.1:3100" };
  const store = {} as OpsStore;

  /** A service that records decisions. */
  function fakeService() {
    const decisions: [string, string][] = [];
    const service: MediaReviewService = {
      list: async () => ({ unreviewed: [toMediaReviewItem(ROW)], decided: [] }),
      decide: async (id, review) => {
        decisions.push([id, review]);
        return { ...toMediaReviewItem(ROW), review };
      },
      file: async () => null,
    };
    return { service, decisions };
  }

  it("lists and decides", async () => {
    const { service, decisions } = fakeService();
    const app = buildConsoleApp(store, { mediaReview: service });
    assert.equal((await app.inject({ method: "GET", url: "/api/ops/media-review" })).json().unreviewed.length, 1);
    const saved = await app.inject({ method: "PUT", url: `/api/ops/media-review/${ID}`, headers: json, payload: { review: "reviewed" } });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual(decisions, [[ID, "reviewed"]]);
  });

  const refusals: [string, Record<string, string>, unknown, number][] = [
    ["a request from another host", { ...json, host: "evil.example:3100" }, { review: "removed" }, 403],
    ["a cross-site form post", { "content-type": "text/plain", host: "127.0.0.1:3100" }, '{"review":"removed"}', 415],
    ["an unknown decision", json, { review: "unreviewed" }, 400],
  ];
  for (const [what, headers, payload, status] of refusals) {
    it(`refuses ${what} without saving`, async () => {
      const { service, decisions } = fakeService();
      const app = buildConsoleApp(store, { mediaReview: service });
      const response = await app.inject({ method: "PUT", url: `/api/ops/media-review/${ID}`, headers, payload: payload as string });
      assert.equal(response.statusCode, status);
      assert.deepEqual(decisions, []);
    });
  }

  it("answers 404 for a thumbnail it cannot show", async () => {
    const app = buildConsoleApp(store, { mediaReview: fakeService().service });
    assert.equal((await app.inject({ method: "GET", url: `/api/ops/media-review/${ID}/file` })).statusCode, 404);
  });
});
