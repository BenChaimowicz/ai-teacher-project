import assert from "node:assert/strict";
import { test } from "node:test";
import type { MediaDescriptorFields } from "@senoy/db";
import { isAttachable, rankCandidates, vocabularyOf } from "./media-library.ts";

/** A library still with the given category, tags, and type. */
function file(storageKey: string, mediaCategory: MediaDescriptorFields["mediaCategory"], topicTags: string[], mimeType = "image/jpeg") {
  return { storageKey, mediaCategory, topicTags, mimeType, origin: "library" as const, kind: "image" as const } as MediaDescriptorFields;
}

test("A Reading attaches library stills, raster or SVG; never audio, a loop, or a generated file", () => {
  assert.equal(isAttachable(file("a.jpg", "drum-grip", ["grip"])), true);
  assert.equal(isAttachable(file("a.svg", "drum-stroke", ["stroke"], "image/svg+xml")), true);
  assert.equal(isAttachable({ ...file("a.mp3", "drum-grip", ["grip"], "audio/mpeg"), kind: "audio" }), false);
  assert.equal(isAttachable({ ...file("a.webp", "drum-grip", ["grip"], "image/webp"), kind: "animation" }), false);
  assert.equal(isAttachable({ ...file("a.png", "drum-grip", ["grip"], "image/png"), origin: "generated" }), false);
});

test("The vocabulary lists each category once with every tag its files carry, sorted", () => {
  const rows = [file("b", "drum-notation", ["rock-beat", "4-4"]), file("a", "drum-grip", ["matched-grip"]), file("c", "drum-notation", ["6-8", "4-4"])];
  assert.deepEqual(vocabularyOf(rows), [
    { mediaCategory: "drum-grip", topicTags: ["matched-grip"] },
    { mediaCategory: "drum-notation", topicTags: ["4-4", "6-8", "rock-beat"] },
  ]);
});

test("Candidates share a tag with the request, most shared first, then by storage key", () => {
  const rows = [file("z", "drum-grip", ["matched-grip"]), file("y", "drum-grip", ["matched-grip", "fulcrum"]), file("x", "drum-grip", ["traditional-grip"]), file("w", "drum-grip", ["matched-grip"])];
  assert.deepEqual(rankCandidates(rows, ["matched-grip", "fulcrum"]).map(({ storageKey }) => storageKey), ["y", "w", "z"]);
});
