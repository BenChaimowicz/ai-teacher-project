import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { test } from "node:test";
import { mediaDescriptorFailures, type VisualBrief } from "@senoy/db";
import { CATALOG_DIR, sha256Of, type MediaStorage } from "@senoy/media";
import { COMMONS_API_URL } from "./commons.ts";
import {
  findVisualOnCommons, MAX_JUDGED, MAX_REMEMBERED_ROUTES, mergePicks, rememberedRoutes, type CommonsLibraryStore, type LibraryMatch, type VisualJudge,
  type VisualVerdict,
} from "./commons-ingest.ts";
import { MAX_SCREENED, type MediaLibrarian } from "./media-librarian.ts";
import { libraryCandidates, libraryFiles, type MediaDescriptorRow } from "./media-library.ts";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts } from "./model-ports.ts";
import { OPENVERSE_API_URL } from "./openverse.ts";
import { createTrackedTransport, installUsageTracking, type PipelineEventStart, type UsageRecordRow, type UsageSink } from "./usage-tracking.ts";

/** Live Commons replies for the French grip brief, recorded 2026-11-03, by search string. */
const REPLIES = (JSON.parse(readFileSync(new URL("./fixtures/commons-french-grip.json", import.meta.url), "utf8")) as { replies: Record<string, unknown> }).replies;

/**
 * Live replies for a matched-grip search, recorded 2026-11-04: Commons searches by search string, Openverse searches by
 * keywords, the Commons lookup of the files Openverse found, and the files of `Category:Drumsticks`.
 */
const DRUMS = JSON.parse(readFileSync(new URL("./fixtures/media-search-drum-grip.json", import.meta.url), "utf8")) as {
  commons: Record<string, unknown>; openverse: Record<string, unknown>; pages: { ids: number[]; reply: unknown }; categories: Record<string, unknown>;
};

/** A real JPEG standing in for every downloaded thumbnail (any still works: the Judge here is a fake). */
const JPEG = new Uint8Array(readFileSync(`${CATALOG_DIR}/drums/matched-grip-both-hands.jpg`));

/** The French grip page in the recording, as Commons spells its description page. */
const FRENCH_PAGE = "https://commons.wikimedia.org/wiki/File:French_grip_right_hand_01.jpg";

/** A drum Course's technique visual the seeded library has no file for. */
const BRIEF: VisualBrief = {
  kind: "technique",
  subject: "French grip on a drumstick: the right hand with the thumb on top",
  mustShow: ["the thumb on top of the stick", "the palm facing inward, not down"],
  caption: "French grip: the thumb sits on top of the stick and the palm faces inward, so the fingers do the work.",
  alt: "A right hand holding a drumstick with the thumb on top and the palm turned sideways.",
  mediaCategory: "drum-grip",
  topicTags: ["french-grip", "right-hand"],
};

/**
 * A fetch that answers Commons searches from the recording and every thumbnail with {@link JPEG}.
 * @returns The fetch and every URL it was asked for
 */
function recordedCommons() {
  const urls: string[] = [];
  const agents: (string | null)[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    agents.push(new Headers(init?.headers).get("User-Agent"));
    if (url.startsWith(COMMONS_API_URL)) {
      const query = new URL(url).searchParams.get("gsrsearch")!;
      // Commons ANDs the words, so a recording answers any query made of the same words in any order.
      const words = (text: string) => text.split(" ").sort().join(" ");
      const recorded = Object.keys(REPLIES).find((key) => words(key) === words(query));
      return new Response(JSON.stringify(recorded ? REPLIES[recorded] : { batchcomplete: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(JPEG.byteLength) } });
  };
  return { fetch, urls, agents };
}

/** A JSON reply. */
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/**
 * A fetch over the matched-grip recording. Each thumbnail is {@link JPEG} with its own URL appended after the image, so
 * every file has its own bytes and a Judge can tell them apart by the title in their URL.
 * @param missing - Commons search strings that find nothing here, as when Commons' own search misses the words
 * @returns The fetch and every URL it was asked for
 */
function recordedDrums(missing: string[] = []) {
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    const params = new URL(url).searchParams;
    if (url.startsWith(OPENVERSE_API_URL)) return json(DRUMS.openverse[params.get("q")!] ?? { result_count: 0, results: [] });
    if (url.startsWith(COMMONS_API_URL)) {
      const search = params.get("gsrsearch");
      if (search !== null) return json(missing.includes(search) ? { batchcomplete: true } : DRUMS.commons[search] ?? { batchcomplete: true });
      if (params.has("gcmtitle")) return json(DRUMS.categories[params.get("gcmtitle")!] ?? { batchcomplete: true });
      const wanted = params.get("pageids")!.split("|").map(Number);
      const reply = DRUMS.pages.reply as { query: { pages: { pageid: number }[] } };
      return json({ ...reply, query: { pages: reply.query.pages.filter(({ pageid }) => wanted.includes(pageid)) } });
    }
    const bytes = new Uint8Array([...JPEG, ...new TextEncoder().encode(url)]);
    return new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(bytes.byteLength) } });
  };
  return { fetch, urls };
}

/**
 * A Judge that passes only the file whose thumbnail URL names `title`, as the drum recording's bytes carry their URL.
 * @param title - Part of the passing file's name, as in its URL
 */
function judgeOnly(title: string) {
  const judged: string[] = [];
  const judge: VisualJudge = async (image) => {
    const tail = new TextDecoder().decode(image.bytes.subarray(JPEG.byteLength));
    judged.push(decodeURIComponent(new URL(tail).pathname.split("/").pop() ?? ""));
    return tail.includes(title) ? { pass: true, reasons: [] } : { pass: false, reasons: ["This is not a matched grip."] };
  };
  return { judge, judged };
}

/**
 * A librarian with no model: its searches fail, so the rule-built ones run; it picks every result and ranks every
 * preview in search order. The search then behaves as before SEN-132, which the French grip tests rely on.
 */
const passThrough: MediaLibrarian = {
  async writeQueries() {
    return { queries: [], error: "no model" };
  },
  async readResults(_brief, results) {
    return { picks: results.map(({ id }) => id), categories: [], queries: [], error: null };
  },
  async screen(_brief, images) {
    return { ranked: images.map(({ id }) => id), error: null };
  },
};

/**
 * A scripted librarian, like a person who knows drums: it writes `queries`, picks results whose title says `keep`,
 * names `categories` on the first read, and ranks every preview whose bytes name `keep` first.
 * @param script - What it writes and what it keeps
 * @returns The librarian and every call it got
 */
function scriptedLibrarian(script: { queries: string[]; keep: RegExp; categories?: string[]; refined?: string[] }) {
  const calls: { call: "write" | "read" | "screen"; refine?: boolean; shown: string[] }[] = [];
  const librarian: MediaLibrarian = {
    async writeQueries() {
      calls.push({ call: "write", shown: [] });
      return { queries: script.queries, error: null };
    },
    async readResults(_brief, results, refine) {
      calls.push({ call: "read", refine, shown: results.map(({ title }) => title) });
      return {
        picks: results.filter(({ title }) => script.keep.test(title)).map(({ id }) => id),
        categories: refine ? script.categories ?? [] : [],
        queries: refine ? script.refined ?? [] : [],
        error: null,
      };
    },
    async screen(_brief, images) {
      const named = images.map(({ id, image }) => ({ id, url: new TextDecoder().decode(image.bytes.subarray(JPEG.byteLength)) }));
      calls.push({ call: "screen", shown: named.map(({ url }) => url) });
      return { ranked: named.filter(({ url }) => script.keep.test(decodeURIComponent(url).replace(/_/g, " "))).map(({ id }) => id), error: null };
    },
  };
  return { librarian, calls };
}

/** The drum Reading's technique brief from the 2026-11-04 live run, which got no picture. */
const MATCHED: VisualBrief = {
  kind: "technique",
  subject: "A right hand holding a drumstick in matched grip, viewed from above and slightly to the side.",
  mustShow: ["The palm faces downward.", "The thumb lies along the drumstick.", "The other fingers curl around the drumstick."],
  caption: "A hand holds a drumstick with the thumb along the stick and the fingers curled around it.",
  alt: "A right hand holds a drumstick with the palm facing down, the thumb along the stick, and the other fingers curled around it.",
  mediaCategory: "drum-grip",
  topicTags: ["matched-grip", "right-hand"],
};

/** An in-memory `media_descriptors` table that ingest writes and library lookup reads. */
function fakeTable(seed: MediaDescriptorRow[] = []) {
  const rows = [...seed];
  const match = (row: MediaDescriptorRow): LibraryMatch => {
    const { createdAt: _c, updatedAt: _u, foundBy: _f, ...rest } = row;
    return rest;
  };
  const store: CommonsLibraryStore = {
    async bySourceUrl(url) {
      const row = rows.find((candidate) => candidate.source?.url === url);
      return row ? match(row) : null;
    },
    async bySha256(sha256) {
      const row = rows.find((candidate) => candidate.sha256 === sha256);
      return row ? match(row) : null;
    },
    async insertUnreviewed(descriptor, foundBy) {
      const existing = rows.find((row) => row.storageKey === descriptor.storageKey);
      if (existing) return match(existing);
      rows.push({ ...descriptor, review: "unreviewed", foundBy, createdAt: new Date(), updatedAt: new Date() });
      return descriptor;
    },
    async rememberRoute(id, foundBy) {
      const row = rows.find((candidate) => candidate.id === id);
      if (row && !row.foundBy) row.foundBy = foundBy;
    },
    async routes(mediaCategory) {
      const found = rows.filter((row) => row.mediaCategory === mediaCategory && row.review !== "removed" && row.foundBy);
      return rememberedRoutes(found.reverse().map(({ foundBy }) => foundBy));
    },
  };
  return { rows, store };
}

/** An in-memory bucket. */
function fakeBucket() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: MediaStorage = {
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { sha256: sha256Of(object.body), byteSize: object.body.byteLength } : null;
    },
    async get(key) {
      const object = objects.get(key);
      return object ? { body: Readable.from([Buffer.from(object.body)]), contentType: object.contentType, byteSize: object.body.byteLength } : null;
    },
  };
  return { objects, storage };
}

/**
 * A Judge that answers in turn from `verdicts` and keeps what it was shown.
 * @param verdicts - One verdict per call; the last repeats
 */
function fakeJudge(...verdicts: VisualVerdict[]) {
  const seen: { mimeType: string; byteSize: number; brief: VisualBrief }[] = [];
  const judge: VisualJudge = async (image, brief) => {
    seen.push({ mimeType: image.mimeType, byteSize: image.bytes.byteLength, brief });
    return verdicts[Math.min(seen.length - 1, verdicts.length - 1)]!;
  };
  return { judge, seen };
}

/** An in-memory usage sink, installed for one test. */
async function withTracking(run: (recorded: { events: (PipelineEventStart & { id: string })[]; usage: (UsageRecordRow & { pipelineEventId: string | null })[] }) => Promise<void>) {
  const events: (PipelineEventStart & { id: string })[] = [];
  const usage: (UsageRecordRow & { pipelineEventId: string | null })[] = [];
  const sink: UsageSink = {
    async startPipelineEvent(row) {
      const id = `event${events.length + 1}`;
      events.push({ ...row, id });
      return id;
    },
    async finishPipelineEvent() {},
    async insertUsageRecord(row) {
      usage.push(row);
    },
    async setUsageMeasurement() {},
    async insertProductEvent() {},
    async insertApiRequest() {},
  };
  const uninstall = installUsageTracking({ sink, log: { error: () => {} } });
  try {
    await run({ events, usage });
  } finally {
    uninstall();
  }
}

const USER_AGENT = "Knibbler/1.0 (https://example.test; media library ingest)";

test("A drum Course with no French grip image finds one on Commons, uses it, and the next drum Course gets it from the library", async () => {
  const table = fakeTable();
  const bucket = fakeBucket();
  const commons = recordedCommons();
  const { judge, seen } = fakeJudge({ pass: true, reasons: [] });

  assert.deepEqual(libraryCandidates(libraryFiles(table.rows), BRIEF.mediaCategory, BRIEF.topicTags), [], "The library starts with no French grip file.");

  const found = await findVisualOnCommons({ brief: BRIEF, judge, store: table.store, storage: bucket.storage, fetch: commons.fetch, userAgent: USER_AGENT, librarian: passThrough, newId: () => "00000000-0000-4000-8000-000000000129" });

  assert.equal(found.outcome, "ingested");
  const descriptor = found.descriptor!;
  assert.deepEqual(mediaDescriptorFailures(descriptor), []);
  assert.equal(descriptor.origin, "library");
  assert.equal(descriptor.license, "cc_by");
  assert.equal(descriptor.licenseUrl, "https://creativecommons.org/licenses/by/2.5");
  assert.deepEqual(descriptor.source, { title: "File:French grip right hand 01.jpg", author: "Uryah", url: FRENCH_PAGE });
  assert.equal(descriptor.caption, BRIEF.caption);
  assert.equal(descriptor.alt, BRIEF.alt);
  assert.equal(descriptor.mediaCategory, "drum-grip");
  assert.deepEqual(descriptor.topicTags, ["french-grip", "right-hand"]);
  assert.equal(descriptor.sha256, sha256Of(JPEG));
  assert.equal(descriptor.storageKey, `library/commons/${sha256Of(JPEG)}.jpg`);
  assert.ok(descriptor.width && descriptor.height);

  assert.equal(seen.length, 1, "The first-ranked file passed, so only it was judged.");
  assert.equal(seen[0]!.brief, BRIEF, "The Judge is shown the whole brief, mustShow and kind included.");
  assert.deepEqual([...bucket.objects.keys()], [descriptor.storageKey], "The bytes were copied into our bucket, not hotlinked.");
  assert.equal(table.rows[0]!.review, "unreviewed", "It is used at once, marked not yet reviewed.");
  assert.ok(commons.urls.some((url) => url.startsWith("https://upload.wikimedia.org/")), "The thumbnail, not the original, was downloaded.");
  assert.ok(commons.agents.every((agent) => agent === USER_AGENT), "Every Commons call names the product and a contact.");

  // The next drum Course asks the library first, and the file is there like any seeded one.
  const next = libraryCandidates(libraryFiles(table.rows), "drum-grip", ["french-grip"]);
  assert.deepEqual(next.map(({ id }) => id), [descriptor.id]);
  assert.deepEqual(next[0], descriptor, "Lookup returns descriptor fields only, without the review state.");
});

test("The same Commons file is never ingested twice: a page already in the library is reused once it passes", async () => {
  const table = fakeTable();
  const bucket = fakeBucket();
  const first = await findVisualOnCommons({ brief: BRIEF, judge: fakeJudge({ pass: true, reasons: [] }).judge, store: table.store, storage: bucket.storage, fetch: recordedCommons().fetch, userAgent: USER_AGENT, librarian: passThrough });
  // Another Course asks for the same file under other tags, so its library lookup missed.
  const other = { ...BRIEF, topicTags: ["right-hand"] };
  const second = await findVisualOnCommons({ brief: other, judge: fakeJudge({ pass: true, reasons: [] }).judge, store: table.store, storage: bucket.storage, fetch: recordedCommons().fetch, userAgent: USER_AGENT, librarian: passThrough });
  assert.equal(second.outcome, "reused");
  assert.equal(second.descriptor!.id, first.descriptor!.id);
  assert.equal(table.rows.length, 1);
  assert.equal(bucket.objects.size, 1);
});

test("A file a person removed is never taken again, and at most MAX_JUDGED files are judged", async () => {
  const removed: MediaDescriptorRow = {
    id: "00000000-0000-4000-8000-000000000001", kind: "image", origin: "library", license: "cc_by", licenseUrl: "https://creativecommons.org/licenses/by/2.5",
    caption: "c", alt: "a", source: { title: "File:French grip right hand 01.jpg", author: "Uryah", url: FRENCH_PAGE },
    storageKey: "library/commons/x.jpg", mimeType: "image/jpeg", byteSize: 1, sha256: "f".repeat(64), width: 1, height: 1,
    mediaCategory: "drum-grip", topicTags: ["french-grip"], review: "removed", foundBy: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const table = fakeTable([removed]);
  const bucket = fakeBucket();
  const { judge, seen } = fakeJudge({ pass: false, reasons: ["This is a pistol, not a hand holding a drumstick."] });

  const found = await findVisualOnCommons({ brief: BRIEF, judge, store: table.store, storage: bucket.storage, fetch: recordedCommons().fetch, userAgent: USER_AGENT, librarian: passThrough });

  assert.equal(found.outcome, "miss");
  assert.equal(found.descriptor, null);
  assert.equal(seen.length, MAX_JUDGED);
  assert.deepEqual(found.tried.map(({ title, status }) => [title, status]), [
    ["File:French grip right hand 01.jpg", "removed"],
    ["File:Pistol, percussion (AM 1962.54-15).jpg", "judge_failed"],
    ["File:Pistol, percussion (AM 1962.54-14).jpg", "judge_failed"],
    ["File:Pistol, percussion (AM 1962.54-13).jpg", "judge_failed"],
  ]);
  assert.deepEqual(found.tried[1]!.reasons, ["This is a pistol, not a hand holding a drumstick."]);
  assert.equal(bucket.objects.size, 0);
  assert.equal(table.rows.length, 1);
  assert.equal(libraryCandidates(libraryFiles(table.rows), "drum-grip", ["french-grip"]).length, 0, "A removed file is not offered to a new Reading.");
});

test("A Commons outage is a miss, not a failed Lesson", async () => {
  const table = fakeTable();
  const throttled: typeof globalThis.fetch = async () => new Response("You are making too many requests to the API.", { status: 429 });
  const found = await findVisualOnCommons({ brief: BRIEF, judge: fakeJudge({ pass: true, reasons: [] }).judge, store: table.store, storage: fakeBucket().storage, fetch: throttled, userAgent: USER_AGENT, librarian: passThrough });
  assert.equal(found.outcome, "miss");
  assert.equal(found.searches.length, 3, "The librarian could not write searches, so the three rule-built ones ran.");
  assert.equal(found.searchErrors.length, found.searches.length, "Every search failed, and each failure is reported.");
  assert.match(found.searchErrors[0]!, /status 429/);
  assert.deepEqual(found.librarianErrors, ["no model"]);
});

test("The librarian's searches find the matched grip the 2026-11-04 run missed, browse a category it names, and keep the route on the file", async () => {
  const table = fakeTable();
  const bucket = fakeBucket();
  const drums = recordedDrums();
  const { librarian, calls } = scriptedLibrarian({ queries: ["drumstick grip", "matched grip drumstick"], keep: /mached grip/i, categories: ["Category:Drumsticks"] });
  const { judge, judged } = judgeOnly("mached");

  const found = await findVisualOnCommons({ brief: MATCHED, judge, librarian, store: table.store, storage: bucket.storage, fetch: drums.fetch, userAgent: USER_AGENT });

  assert.equal(found.outcome, "ingested", JSON.stringify(found.tried));
  assert.equal(found.descriptor!.source!.title, "File:Drumstick mached grip.jpg");
  assert.equal(found.descriptor!.license, "cc_by", "Its licence was read off its own Commons page.");
  assert.deepEqual(found.foundBy, { index: "commons", query: "drumstick grip filetype:bitmap" });
  assert.deepEqual(table.rows[0]!.foundBy, found.foundBy, "The route that found it is kept on the library file.");
  assert.deepEqual(found.searches.map(({ stage, route }) => [stage, route.index, route.query]), [
    ["librarian", "commons", "drumstick grip filetype:bitmap"],
    ["librarian", "commons", "matched grip drumstick filetype:bitmap"],
    ["librarian", "openverse", "drumstick grip"],
    ["librarian", "openverse", "matched grip drumstick"],
    ["librarian", "commons_category", "Category:Drumsticks"],
  ], "The written searches ran on Commons and Openverse, then the category the first read named.");
  assert.deepEqual(calls.map(({ call, refine }) => [call, refine ?? null]), [["write", null], ["read", true], ["read", false], ["screen", null]]);
  assert.ok(calls[2]!.shown.includes("File:2B Drum sticks.JPG"), "The second read saw the category's files.");
  assert.ok(!calls[2]!.shown.includes("File:Drumstick mached grip.jpg"), "and none the first read had already seen.");
  assert.ok(found.rejected.some(({ title, reason }) => title === "File:Traditional grip detail.jpg" && /librarian read/.test(reason)), "A result the read left out is recorded as turned down.");
  assert.deepEqual(judged, ["Drumstick_mached_grip.jpg"], "Only the screened-in file reached the Judge.");
  assert.ok(found.tried.every(({ status }) => status === "ingested"));
});

test("Openverse finds a file the Commons search missed, and the file's licence is read off its own Commons page", async () => {
  // Commons' own search for these words misses, as the rule-built words did on 2026-11-04.
  const drums = recordedDrums(["drumstick grip filetype:bitmap"]);
  const { librarian } = scriptedLibrarian({ queries: ["drumstick grip"], keep: /mached grip/i });
  const found = await findVisualOnCommons({ brief: MATCHED, judge: judgeOnly("mached").judge, librarian, store: fakeTable().store, storage: fakeBucket().storage, fetch: drums.fetch, userAgent: USER_AGENT });

  assert.equal(found.outcome, "ingested", JSON.stringify(found.tried));
  assert.deepEqual(found.foundBy, { index: "openverse", query: "drumstick grip" });
  const lookup = drums.urls.find((url) => new URL(url).searchParams.has("pageids"));
  assert.ok(lookup, "The Commons files Openverse found were looked up on Commons by page id.");
  assert.equal(new URL(lookup!).searchParams.get("pageids"), "513831|513833|124405046|124405087");
  assert.equal(found.descriptor!.source!.url, "https://commons.wikimedia.org/wiki/File:Drumstick_mached_grip.jpg");
  assert.equal(found.descriptor!.license, "cc_by", "The licence comes from the Commons page, not from Openverse.");
  assert.ok(found.rejected.some(({ reason }) => /found it on flickr, where its licence cannot be checked/.test(reason)), "The Flickr hit was turned down (decision 2026-11-04).");
});

test("The next search for the category starts from the remembered route, makes fewer calls, and reuses the file", async () => {
  const table = fakeTable();
  const bucket = fakeBucket();
  const firstDrums = recordedDrums();
  const first = await findVisualOnCommons({
    brief: MATCHED, judge: judgeOnly("mached").judge, librarian: scriptedLibrarian({ queries: ["drumstick grip", "matched grip drumstick"], keep: /mached grip/i }).librarian,
    store: table.store, storage: bucket.storage, fetch: firstDrums.fetch, userAgent: USER_AGENT,
  });
  assert.equal(first.outcome, "ingested");

  // Another drum Course files its grip under other tags, so its library lookup missed.
  const secondDrums = recordedDrums();
  const { librarian, calls } = scriptedLibrarian({ queries: ["should not be written"], keep: /mached grip/i });
  const second = await findVisualOnCommons({ brief: { ...MATCHED, topicTags: ["grip"] }, judge: judgeOnly("mached").judge, librarian, store: table.store, storage: bucket.storage, fetch: secondDrums.fetch, userAgent: USER_AGENT });

  assert.equal(second.outcome, "reused");
  assert.equal(second.descriptor!.id, first.descriptor!.id);
  assert.deepEqual(second.searches.map(({ stage, route }) => [stage, route.query]), [["remembered", "drumstick grip filetype:bitmap"]]);
  assert.ok(!calls.some(({ call }) => call === "write"), "The remembered route found it, so the librarian wrote no searches.");
  assert.ok(second.searches.length < first.searches.length, `${second.searches.length} searches, against ${first.searches.length} the first time.`);
  assert.ok(secondDrums.urls.length < firstDrums.urls.length);
  assert.equal(table.rows.length, 1);
});

test("A removed file's route is forgotten with it, and a remembered route that finds nothing hands over to the librarian", async () => {
  const table = fakeTable();
  await findVisualOnCommons({
    brief: MATCHED, judge: judgeOnly("mached").judge, librarian: scriptedLibrarian({ queries: ["drumstick grip"], keep: /mached grip/i }).librarian,
    store: table.store, storage: fakeBucket().storage, fetch: recordedDrums().fetch, userAgent: USER_AGENT,
  });
  assert.deepEqual(await table.store.routes("drum-grip"), [{ index: "commons", query: "drumstick grip filetype:bitmap" }]);
  assert.deepEqual(await table.store.routes("drum-stroke"), [], "Routes are remembered per Media category.");

  // The remembered route no longer finds anything: the librarian searches as on a first run.
  const { librarian, calls } = scriptedLibrarian({ queries: ["regular grip drumstick"], keep: /regular grip/i });
  const next = await findVisualOnCommons({
    brief: MATCHED, judge: judgeOnly("regular").judge, librarian, store: table.store, storage: fakeBucket().storage,
    fetch: recordedDrums(["drumstick grip filetype:bitmap"]).fetch, userAgent: USER_AGENT,
  });
  assert.equal(next.outcome, "ingested", JSON.stringify(next.tried));
  assert.deepEqual(next.searches.map(({ stage, route }) => [stage, route.index]), [["remembered", "commons"], ["librarian", "commons"], ["librarian", "openverse"]]);
  assert.deepEqual(calls.map(({ call }) => call), ["read", "write", "read", "screen"]);

  table.rows[0]!.review = "removed";
  assert.deepEqual(await table.store.routes("drum-grip"), [{ index: "commons", query: "regular grip drumstick filetype:bitmap" }], "The removed file's route is forgotten.");
});

test("A seeded file a search finds and reuses gets the route that found it, so the next search starts there", async () => {
  // The seeded grip, as on 2026-11-04: the library check failed it, a search found its page, and the Judge passed it.
  const seeded: MediaDescriptorRow = {
    id: "00000000-0000-4000-8000-000000000012", kind: "image", origin: "library", license: "cc_by", licenseUrl: "https://creativecommons.org/licenses/by/2.5",
    caption: "c", alt: "a", source: { title: "File:Drumstick mached grip.jpg", author: "Uryah", url: "https://commons.wikimedia.org/wiki/File:Drumstick_mached_grip.jpg" },
    storageKey: "library/drums/mached.jpg", mimeType: "image/jpeg", byteSize: 1, sha256: "e".repeat(64), width: 600, height: 428,
    mediaCategory: "drum-grip", topicTags: ["regular-grip"], review: "reviewed", foundBy: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const table = fakeTable([seeded]);
  const search = () => findVisualOnCommons({
    brief: MATCHED, judge: judgeOnly("mached").judge, librarian: scriptedLibrarian({ queries: ["drumstick grip"], keep: /mached grip/i }).librarian,
    store: table.store, storage: fakeBucket().storage, fetch: recordedDrums().fetch, userAgent: USER_AGENT,
  });

  const first = await search();
  assert.equal(first.outcome, "reused");
  assert.deepEqual(table.rows[0]!.foundBy, { index: "commons", query: "drumstick grip filetype:bitmap" });
  const second = await search();
  assert.deepEqual(second.searches.map(({ stage }) => stage), ["remembered"], "The next search started from the route kept on the seeded file.");
  table.rows[0]!.foundBy = { index: "openverse", query: "kept first" };
  await search();
  assert.deepEqual(table.rows[0]!.foundBy, { index: "openverse", query: "kept first" }, "A route already kept is never replaced.");
});

test("Remembered routes are well-formed, once each, newest first, and few", () => {
  const routes = rememberedRoutes([
    { index: "commons", query: "a filetype:bitmap" },
    { index: "commons", query: " a filetype:bitmap " },
    null,
    { index: "flickr", query: "b" },
    { index: "openverse", query: "" },
    { index: "openverse", query: "c" },
    { index: "commons_category", query: "Category:D" },
    { index: "commons", query: "e filetype:bitmap" },
  ]);
  assert.deepEqual(routes, [
    { index: "commons", query: "a filetype:bitmap" },
    { index: "openverse", query: "c" },
    { index: "commons_category", query: "Category:D" },
  ]);
  assert.equal(routes.length, MAX_REMEMBERED_ROUTES);
});

test("The refined searches' picks get up to half the screen, ahead of the first read's surplus", () => {
  const first = Array.from({ length: MAX_SCREENED }, (_, index) => `a${index}`);
  const merged = mergePicks(first, ["b0", "b1"]);
  assert.deepEqual(merged.slice(0, MAX_SCREENED), [...first.slice(0, MAX_SCREENED - 2), "b0", "b1"]);
  assert.deepEqual(merged.slice(MAX_SCREENED), first.slice(MAX_SCREENED - 2));
  assert.deepEqual(mergePicks(["a"], []), ["a"]);
  assert.equal(mergePicks([], Array.from({ length: 20 }, (_, index) => index)).length, 20);
});

test("Each search call, each librarian call, and each Judge call is a Usage Record under one media_search Pipeline Event", async () => {
  await withTracking(async ({ events, usage }) => {
    // The librarian and the Judge on the model ports, whose tracked transport records every call.
    const openrouter: typeof globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string } }; messages: { role: string; content: unknown }[] };
      const content = body.messages.find(({ role }) => role === "user")!.content;
      const input = JSON.parse(typeof content === "string" ? content : (content as { text: string }[])[0]!.text) as { results?: { id: string; title: string }[]; images?: string[] };
      const answers: Record<string, unknown> = {
        media_search_queries: { queries: ["drumstick grip", "matched grip drumstick"] },
        media_search_read: { picks: (input.results ?? []).filter(({ title }) => /mached grip/i.test(title)).map(({ id }) => id), categories: [], queries: [] },
        media_search_screen: { ranked: input.images ?? [] },
        visual: { pass: true, reasons: [] },
      };
      return new Response(JSON.stringify({
        id: "gen-1", provider: "OpenAI",
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(answers[body.response_format.json_schema.name]) } }],
        usage: { prompt_tokens: 900, completion_tokens: 10, total_tokens: 910, cost: 0.004 },
      }), { status: 200 });
    };
    const config = {
      ...loadModelConfig({}), generatorModel: "fixture/author", generatorFallbackModel: "fixture/fallback", triageModel: "fixture/triage",
      lessonGeneratorModel: "fixture/lesson", lessonGeneratorFallbackModel: "fixture/lesson-fallback", judgeModel: "fixture/judge", judgeFallbackModel: "fixture/judge-fallback",
    };
    const ports = createModelPorts({ config, transport: createTrackedTransport({ apiKey: "k", fetch: openrouter }), log: { warn: () => {} } });
    const judge: VisualJudge = async (image, brief) => (await ports.judge.judge({
      systemPrompt: "fixture", input: { mustShow: brief.mustShow }, schemaName: "visual", schema: {}, images: [image], authorModelIds: ["fixture/lesson"],
      parse: (raw) => raw as VisualVerdict,
    })).value;

    const found = await findVisualOnCommons({ brief: MATCHED, judge, triage: ports.triage, store: fakeTable().store, storage: fakeBucket().storage, fetch: recordedDrums().fetch, userAgent: USER_AGENT });
    assert.equal(found.outcome, "ingested", JSON.stringify(found));
    assert.deepEqual(found.librarianErrors, []);

    assert.deepEqual(events.map(({ kind, label }) => [kind, label]), [["media_search", MATCHED.subject]]);
    const eventId = events[0]!.id;
    assert.ok(usage.every(({ pipelineEventId }) => pipelineEventId === eventId));
    assert.deepEqual(usage.map(({ vendor, role, modelId }) => [vendor, role, modelId]), [
      ["openrouter", "triage", "fixture/triage"],
      ["wikimedia", "media_search", "commons-search"],
      ["wikimedia", "media_search", "commons-search"],
      ["openverse", "media_search", "openverse-search"],
      ["openverse", "media_search", "openverse-search"],
      ["openrouter", "triage", "fixture/triage"],
      ["wikimedia", "media_search", "commons-file"],
      ["openrouter", "triage", "fixture/triage"],
      ["openrouter", "judge", "fixture/judge"],
    ], "Write, search both indexes, read, download the one pick, screen it, judge it.");
    assert.ok(usage.filter(({ vendor }) => vendor !== "openrouter").every(({ costUsd, costBasis }) => costUsd === 0 && costBasis === "actual"));
    const screen = usage.find(({ request }) => (request as { schemaName?: string }).schemaName === "media_search_screen")!;
    assert.deepEqual((screen.request as { images: { detail: string }[] }).images.map(({ detail }) => detail), ["low"], "The screen looks at low-detail previews.");
  });
});
