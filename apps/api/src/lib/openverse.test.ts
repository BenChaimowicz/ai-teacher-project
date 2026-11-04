import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { commonsPageIdOf, openverseSearchUrl, parseOpenverseSearch, searchOpenverse } from "./openverse.ts";

/** The live Openverse reply for "drumstick grip", recorded 2026-11-04. */
const REPLY = (JSON.parse(readFileSync(new URL("./fixtures/media-search-drum-grip.json", import.meta.url), "utf8")) as { openverse: Record<string, unknown> }).openverse["drumstick grip"];

test("An Openverse search asks only for licences that allow commercial use and modification", () => {
  const url = new URL(openverseSearchUrl("drumstick grip"));
  assert.equal(url.origin + url.pathname, "https://api.openverse.org/v1/images/");
  assert.equal(url.searchParams.get("q"), "drumstick grip");
  assert.equal(url.searchParams.get("license_type"), "commercial,modification");
});

test("A recorded search keeps its Commons files as page ids, in relevance order, and turns the Flickr hit down", () => {
  const result = parseOpenverseSearch("drumstick grip", REPLY);
  assert.deepEqual(result.hits, [
    { pageId: 513831, title: "Drumstick regular grip", rank: 2 },
    { pageId: 513833, title: "Drumstick mached grip", rank: 3 },
    { pageId: 124405046, title: "German grip", rank: 4 },
    { pageId: 124405087, title: "Frensh grip", rank: 5 },
  ]);
  assert.deepEqual(result.rejected, [{ title: "Drumsticks on snare drum.", reason: "Openverse found it on flickr, where its licence cannot be checked on its own page yet." }]);
});

test("Only a Commons landing URL with a numeric curid names a page", () => {
  assert.equal(commonsPageIdOf("https://commons.wikimedia.org/w/index.php?curid=513833"), 513833);
  assert.equal(commonsPageIdOf("https://commons.wikimedia.org/wiki/File:X.jpg"), null);
  assert.equal(commonsPageIdOf("https://evil.example/w/index.php?curid=1"), null);
  assert.equal(commonsPageIdOf("https://commons.wikimedia.org/w/index.php?curid=1;drop"), null);
  assert.equal(commonsPageIdOf(42), null);
  const noId = parseOpenverseSearch("q", { results: [{ title: "X", source: "wikimedia", foreign_landing_url: "https://commons.wikimedia.org/wiki/File:X.jpg" }] });
  assert.deepEqual(noId.rejected.map(({ reason }) => reason), ["Openverse gave no Commons page id to read its licence from."]);
});

test("A throttled Openverse search finds nothing and says why, rather than failing the Lesson", async () => {
  const throttled: typeof globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Request was throttled." }), { status: 429 });
  const result = await searchOpenverse(throttled, "drumstick grip");
  assert.deepEqual(result.hits, []);
  assert.match(result.error!, /status 429/);
  const down: typeof globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  assert.match((await searchOpenverse(down, "drumstick grip")).error!, /Openverse search failed .* fetch failed/);
});
