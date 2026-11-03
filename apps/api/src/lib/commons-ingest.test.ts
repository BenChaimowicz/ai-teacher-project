import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { test } from "node:test";
import { mediaDescriptorFailures, type VisualBrief } from "@senoy/db";
import { CATALOG_DIR, sha256Of, type MediaStorage } from "@senoy/media";
import { COMMONS_API_URL } from "./commons.ts";
import { findVisualOnCommons, MAX_JUDGED, type CommonsLibraryStore, type LibraryMatch, type VisualJudge, type VisualVerdict } from "./commons-ingest.ts";
import { libraryCandidates, libraryFiles, type MediaDescriptorRow } from "./media-library.ts";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts } from "./model-ports.ts";
import { createTrackedTransport, installUsageTracking, type PipelineEventStart, type UsageRecordRow, type UsageSink } from "./usage-tracking.ts";

/** Live Commons replies for the French grip brief, recorded 2026-11-03, by search string. */
const REPLIES = (JSON.parse(readFileSync(new URL("./fixtures/commons-french-grip.json", import.meta.url), "utf8")) as { replies: Record<string, unknown> }).replies;

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
      return new Response(JSON.stringify(REPLIES[query] ?? { batchcomplete: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(JPEG.byteLength) } });
  };
  return { fetch, urls, agents };
}

/** An in-memory `media_descriptors` table that ingest writes and library lookup reads. */
function fakeTable(seed: MediaDescriptorRow[] = []) {
  const rows = [...seed];
  const match = (row: MediaDescriptorRow): LibraryMatch => {
    const { createdAt: _c, updatedAt: _u, ...rest } = row;
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
    async insertUnreviewed(descriptor) {
      const existing = rows.find((row) => row.storageKey === descriptor.storageKey);
      if (existing) return match(existing);
      rows.push({ ...descriptor, review: "unreviewed", createdAt: new Date(), updatedAt: new Date() });
      return descriptor;
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

  const found = await findVisualOnCommons({ brief: BRIEF, judge, store: table.store, storage: bucket.storage, fetch: commons.fetch, userAgent: USER_AGENT, newId: () => "00000000-0000-4000-8000-000000000129" });

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
  const first = await findVisualOnCommons({ brief: BRIEF, judge: fakeJudge({ pass: true, reasons: [] }).judge, store: table.store, storage: bucket.storage, fetch: recordedCommons().fetch, userAgent: USER_AGENT });
  // Another Course asks for the same file under other tags, so its library lookup missed.
  const other = { ...BRIEF, topicTags: ["thumb-on-top"] };
  const second = await findVisualOnCommons({ brief: other, judge: fakeJudge({ pass: true, reasons: [] }).judge, store: table.store, storage: bucket.storage, fetch: recordedCommons().fetch, userAgent: USER_AGENT });
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
    mediaCategory: "drum-grip", topicTags: ["french-grip"], review: "removed", createdAt: new Date(), updatedAt: new Date(),
  };
  const table = fakeTable([removed]);
  const bucket = fakeBucket();
  const { judge, seen } = fakeJudge({ pass: false, reasons: ["This is a pistol, not a hand holding a drumstick."] });

  const found = await findVisualOnCommons({ brief: BRIEF, judge, store: table.store, storage: bucket.storage, fetch: recordedCommons().fetch, userAgent: USER_AGENT });

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
  const found = await findVisualOnCommons({ brief: BRIEF, judge: fakeJudge({ pass: true, reasons: [] }).judge, store: table.store, storage: fakeBucket().storage, fetch: throttled, userAgent: USER_AGENT });
  assert.equal(found.outcome, "miss");
  assert.equal(found.searchErrors.length, 2);
  assert.match(found.searchErrors[0]!, /status 429/);
});

test("Each Commons call and each Judge call is a Usage Record under one media_search Pipeline Event", async () => {
  await withTracking(async ({ events, usage }) => {
    // The Judge the way SEN-121 will build it: on the model ports, whose tracked transport records every call.
    const openrouter: typeof globalThis.fetch = async () => new Response(JSON.stringify({
      id: "gen-1", provider: "OpenAI",
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ pass: true, reasons: [] }) } }],
      usage: { prompt_tokens: 900, completion_tokens: 10, total_tokens: 910, cost: 0.004 },
    }), { status: 200 });
    const config = {
      ...loadModelConfig({}), generatorModel: "fixture/author", generatorFallbackModel: "fixture/fallback",
      lessonGeneratorModel: "fixture/lesson", lessonGeneratorFallbackModel: "fixture/lesson-fallback", judgeModel: "fixture/judge", judgeFallbackModel: "fixture/judge-fallback",
    };
    const ports = createModelPorts({ config, transport: createTrackedTransport({ apiKey: "k", fetch: openrouter }), log: { warn: () => {} } });
    const judge: VisualJudge = async (image, brief) => (await ports.judge.judge({
      systemPrompt: "fixture", input: { mustShow: brief.mustShow }, schemaName: "visual", schema: {}, images: [image], authorModelIds: ["fixture/lesson"],
      parse: (raw) => raw as VisualVerdict,
    })).value;

    const found = await findVisualOnCommons({ brief: BRIEF, judge, store: fakeTable().store, storage: fakeBucket().storage, fetch: recordedCommons().fetch, userAgent: USER_AGENT });
    assert.equal(found.outcome, "ingested", JSON.stringify(found.tried));

    assert.deepEqual(events.map(({ kind, label }) => [kind, label]), [["media_search", BRIEF.subject]]);
    const eventId = events[0]!.id;
    assert.deepEqual(usage.map(({ vendor, role, modelId, pipelineEventId }) => [vendor, role, modelId, pipelineEventId]), [
      ["wikimedia", "media_search", "commons-search", eventId],
      ["wikimedia", "media_search", "commons-file", eventId],
      ["openrouter", "judge", "fixture/judge", eventId],
    ]);
    assert.ok(usage.filter(({ vendor }) => vendor === "wikimedia").every(({ costUsd, costBasis }) => costUsd === 0 && costBasis === "actual"));
  });
});
