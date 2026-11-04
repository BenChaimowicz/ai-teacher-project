import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb, loadRootEnv, type VisualBrief } from "@senoy/db";
import { createMediaStorage, mediaStorageConfigFromEnv } from "@senoy/media";
import { findVisualOnCommons, type CommonsFind } from "./commons-ingest.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";
import { loadModelConfig } from "./model-config.ts";
import { commonsJudge, createVisualJudge } from "./visual-judge.ts";

/**
 * The media search on its own (SEN-132): one technique brief searched twice with the real librarian, Commons, Openverse,
 * technique Judge, database, and bucket, so a reviewer sees what the first search found and whether the second started
 * from the remembered route (or found the file in the library) with fewer calls. A passing file is added to the shared
 * library as unreviewed, as in production. Not part of `pnpm test`. Argument: the case, `drum-grip` (default) or
 * `loop-flaming`, a technique outside drums.
 */

/** Each brief this check knows, and where its run is written. */
const CASES: Record<string, { brief: VisualBrief; out: string }> = {
  "drum-grip": {
    out: "docs/research/sen-132-drum-grip-media-search-run.json",
    brief: {
      kind: "technique",
      subject: "A right hand holding a drumstick in matched grip, viewed from above and slightly to the side.",
      mustShow: ["The palm faces downward.", "The thumb lies along the drumstick.", "The other fingers curl around the drumstick."],
      caption: "A hand holds a drumstick with the thumb along the stick and the fingers curled around it.",
      alt: "A right hand holds a drumstick with the palm facing down, the thumb along the stick, and the other fingers curled around it.",
      mediaCategory: "drum-grip",
      topicTags: ["matched-grip", "right-hand"],
    },
  },
  "loop-flaming": {
    out: "docs/research/sen-132-loop-flaming-media-search-run.json",
    brief: {
      kind: "technique",
      subject: "A hand holds an inoculating loop by its handle with the wire loop in a Bunsen burner flame, sterilising it before use.",
      mustShow: ["A hand holds the loop by its handle.", "The wire loop is in the flame.", "The flame comes from a laboratory burner."],
      caption: "Flaming the loop: the wire is held in the burner flame until it glows, which kills anything on it.",
      alt: "A hand holds the handle of an inoculating loop so that its thin wire end sits in the flame of a laboratory burner.",
      mediaCategory: "culture-technique",
      topicTags: ["aseptic-technique", "inoculating-loop", "flaming"],
    },
  },
};

/**
 * One search's summary line for the console.
 * @param label - Which run
 * @param find - Its result
 */
function summary(label: string, find: CommonsFind): string {
  const lines = [
    `${label}: ${find.outcome}${find.descriptor ? ` ${find.descriptor.source?.title ?? find.descriptor.storageKey}` : ""}${find.foundBy ? ` via ${find.foundBy.index} "${find.foundBy.query}"` : ""}`,
    `  ${find.searches.length} search(es): ${find.searches.map(({ stage, route, found, error }) => `${stage}/${route.index} "${route.query}" → ${error ? "error" : found}`).join("; ")}`,
    ...find.tried.map(({ title, status, reasons }) => `  tried ${title}: ${status}${reasons.length ? ` (${reasons.join(" ").slice(0, 300)})` : ""}`),
    ...find.librarianErrors.map((error) => `  librarian error: ${error}`),
    ...find.searchErrors.map((error) => `  search error: ${error}`),
  ];
  return `${lines.join("\n")}\n`;
}

/** Runs the case twice and writes both results. */
async function checkMediaSearch() {
  const root = loadRootEnv(import.meta.url, 4);
  const name = process.argv[2] ?? "drum-grip";
  const run = CASES[name];
  if (!run) throw new Error(`[media-search.live-check.ts: checkMediaSearch] Unknown case || case=${name} || Use one of ${Object.keys(CASES).join(", ")}.`);
  const db = createDb(process.env.DATABASE_URL ?? "", { max: 1 });
  try {
    const storage = createMediaStorage(mediaStorageConfigFromEnv());
    // The brief is written by the Lesson author in production, so that model is ruled out of judging (ADR 0015).
    const judge = commonsJudge(createVisualJudge({}), [loadModelConfig().lessonGeneratorModel]);
    const finds: CommonsFind[] = [];
    for (const label of ["first", "second"]) {
      const startedAt = Date.now();
      const find = await findVisualOnCommons({ brief: run.brief, judge, db, storage });
      finds.push(find);
      process.stdout.write(`${summary(`${label} (${((Date.now() - startedAt) / 1000).toFixed(1)} s)`, find)}`);
    }
    const outPath = resolve(root, run.out);
    await writeFile(outPath, `${JSON.stringify({ ranAt: new Date().toISOString(), brief: run.brief, runs: finds }, null, 2)}\n`);
    process.stdout.write(`wrote ${outPath}\n`);

    const [first, second] = finds as [CommonsFind, CommonsFind];
    if (first.outcome === "miss") {
      process.stdout.write("Nothing passed the technique Judge: reported as a miss.\n");
      return;
    }
    assert.notEqual(second.outcome, "miss", "The second search lost the file the first one found.");
    assert.ok(second.searches.length < first.searches.length, `The second search made ${second.searches.length} search calls, the first ${first.searches.length}.`);
    process.stdout.write("Media search live check passed.\n");
  } finally {
    await db.$client.end();
  }
}

await withLiveCheckTracking("check:media-search:live", checkMediaSearch);
