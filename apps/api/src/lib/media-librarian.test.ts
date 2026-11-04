import assert from "node:assert/strict";
import { test } from "node:test";
import type { VisualBrief } from "@senoy/db";
import { cleanQuery, createMediaLibrarian, MAX_SCREENED, parseResultsRead, parseWrittenQueries, type LibrarianResult } from "./media-librarian.ts";
import type { ModelReply, StructuredRequest, Triage } from "./model-ports.ts";
import { ModelError } from "./openrouter.ts";

/** The drum Reading's technique brief from the 2026-11-04 live run. */
const BRIEF: VisualBrief = {
  kind: "technique",
  subject: "A right hand holding a drumstick in matched grip, viewed from above and slightly to the side.",
  mustShow: ["The palm faces downward.", "The thumb lies along the drumstick."],
  caption: "A hand holds a drumstick.",
  alt: "A right hand holds a drumstick.",
  mediaCategory: "drum-grip",
  topicTags: ["matched-grip", "right-hand"],
};

/** Three results as Commons describes them. */
const RESULTS: LibrarianResult[] = [
  { id: "r1", title: "File:Drumstick mached grip.jpg", description: "drum stick and hand", categories: ["Category:Drumsticks"] },
  { id: "r2", title: "File:Pistol, percussion.jpg", description: "A flintlock pistol", categories: ["Category:Pistols"] },
  { id: "r3", title: "File:Matched Grip.jpg", description: "", categories: ["Category:Drumsticks", "Category:Matched grip"] },
];

/**
 * A triage port that answers each call from `reply` and keeps the requests.
 * @param reply - The raw model output, or an error to throw
 */
function fakeTriage(reply: (request: StructuredRequest<unknown>) => unknown) {
  const requests: StructuredRequest<unknown>[] = [];
  const triage: Triage = {
    modelId: "fixture/triage",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      requests.push(request as StructuredRequest<unknown>);
      const raw = reply(request as StructuredRequest<unknown>);
      if (raw instanceof Error) throw raw;
      return { value: request.parse(raw), modelId: "fixture/triage" };
    },
  };
  return { triage, requests };
}

test("A search is sent without quotes or search operators, and at most four words", () => {
  assert.equal(cleanQuery("\"Matched grip\" drumstick"), "matched grip drumstick");
  assert.equal(cleanQuery("drumstick filetype:bitmap -pistol"), "drumstick", "An operator or an excluded word is dropped whole, never searched for.");
  assert.equal(cleanQuery("incategory:Drumsticks grip"), "grip");
  assert.equal(cleanQuery("drummer's grip (matched)"), "drummer's grip matched");
  assert.equal(cleanQuery("one two three four five"), "one two three four");
  assert.equal(cleanQuery("  ||  "), "");
});

test("Written searches are cleaned and deduped; none usable is a bad reply the port asks again for", () => {
  assert.deepEqual(parseWrittenQueries({ queries: ["Drumstick grip", "drumstick  grip", "matched grip", "regular grip", "fourth"] }), ["drumstick grip", "matched grip", "regular grip"]);
  assert.throws(() => parseWrittenQueries({ queries: ["\"\"", "|"] }), ModelError);
  assert.throws(() => parseWrittenQueries({ queries: "drumstick grip" }), ModelError);
});

test("A read keeps only ids it was shown and categories copied from the results; without refine it only picks", () => {
  const read = parseResultsRead({ picks: ["r3", "r9", "r1", "r3"], categories: ["Category:Matched grip", "Category:Invented"], queries: ["Regular grip"] }, RESULTS, true);
  assert.deepEqual(read, { picks: ["r3", "r1"], categories: ["Category:Matched grip"], queries: ["regular grip"] });
  assert.deepEqual(parseResultsRead({ picks: ["r1"], categories: ["Category:Drumsticks"], queries: ["more"] }, RESULTS, false), { picks: ["r1"], categories: [], queries: [] });
  assert.throws(() => parseResultsRead({ picks: [1] }, RESULTS, true), ModelError);
});

test("Each librarian failure falls back: no searches, every result picked, every preview ranked, and the error is kept", async () => {
  const { triage } = fakeTriage(() => new ModelError("timeout"));
  const librarian = createMediaLibrarian(triage);
  const written = await librarian.writeQueries(BRIEF);
  assert.deepEqual(written.queries, []);
  assert.match(written.error!, /\[media-librarian\.ts: writeQueries\] The librarian call failed/);
  const read = await librarian.readResults(BRIEF, RESULTS, true);
  assert.deepEqual([read.picks, read.categories, read.queries], [["r1", "r2", "r3"], [], []]);
  assert.ok(read.error);
  const image = { mimeType: "image/jpeg", bytes: new Uint8Array([1]) };
  const screen = await librarian.screen(BRIEF, [{ id: "p1", image }, { id: "p2", image }]);
  assert.deepEqual(screen.ranked, ["p1", "p2"]);
  assert.ok(screen.error);
});

test("The librarian sees the brief without its caption, reads text only, and screens low-detail previews, at most a dozen", async () => {
  const { triage, requests } = fakeTriage((request) => request.schemaName === "media_search_screen"
    ? { ranked: ["p2", "p99", "p1"] }
    : request.schemaName === "media_search_read" ? { picks: ["r1"], categories: [], queries: [] } : { queries: ["drumstick grip"] });
  const librarian = createMediaLibrarian(triage);

  assert.deepEqual((await librarian.writeQueries(BRIEF)).queries, ["drumstick grip"]);
  assert.deepEqual(requests[0]!.input, { brief: { kind: BRIEF.kind, subject: BRIEF.subject, mustShow: BRIEF.mustShow, topicTags: BRIEF.topicTags } });
  assert.doesNotMatch(requests[0]!.systemPrompt, /drum/i, "Prompts name no subject (ADR 0011).");

  assert.deepEqual((await librarian.readResults(BRIEF, RESULTS, false)).picks, ["r1"]);
  assert.equal(requests[1]!.images, undefined, "A read is text only.");
  assert.equal((requests[1]!.input as { refine: boolean }).refine, false);

  const image = { mimeType: "image/jpeg", bytes: new Uint8Array([1]) };
  const many = Array.from({ length: MAX_SCREENED + 3 }, (_, index) => ({ id: `p${index + 1}`, image }));
  assert.deepEqual((await librarian.screen(BRIEF, many)).ranked, ["p2", "p1"], "Unknown ids are dropped.");
  assert.equal(requests[2]!.images!.length, MAX_SCREENED);
  assert.ok(requests[2]!.images!.every(({ detail }) => detail === "low"));

  const empty = await librarian.readResults(BRIEF, [], true);
  assert.deepEqual([empty.picks, requests.length], [[], 3], "Nothing to read makes no call.");
});
