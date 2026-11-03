import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_GLOSSARY_TERMS, mentionsTerm, parseGlossary, parseReadingBody, readingWordCount } from "./reading-lesson.ts";

/** A stored public-domain still, as a media block's descriptor snapshot holds it. */
const DESCRIPTOR = {
  id: "d0a1e001-0000-4000-8000-000000000001",
  kind: "image",
  origin: "library",
  license: "public_domain",
  licenseUrl: null,
  caption: "Gram-positive cocci in clusters.",
  alt: "Purple round cells in grape-like clusters.",
  source: { title: "PHIL 2296", author: "CDC/Dr. Richard Facklam", url: "https://phil.cdc.gov/Details.aspx?pid=2296" },
  storageKey: "library/micro/gram-positive-cocci-phil-2296.jpg",
  mimeType: "image/jpeg",
  byteSize: 55_520,
  sha256: "b".repeat(64),
  width: 700,
  height: 470,
  mediaCategory: "gram-stain-result",
  topicTags: ["gram-positive", "cocci"],
};

test("A reading body keeps a valid media block next to its prose", () => {
  const body = parseReadingBody({
    sections: [{
      heading: "Reading a stain",
      blocks: [
        { kind: "prose", text: "Gram-positive cells stay purple [1]." },
        { kind: "media", caption: "Gram-positive cocci, stained purple.", alt: "Purple round cells in clusters.", descriptor: DESCRIPTOR },
      ],
    }],
  });
  assert.equal(body?.sections[0]?.blocks.length, 2);
  assert.equal(body?.sections[0]?.blocks[1]?.kind, "media");
});

test("A media block whose snapshot breaks the catalog rules is dropped, never shown", () => {
  const body = parseReadingBody({
    sections: [{
      heading: "Reading a stain",
      blocks: [
        { kind: "prose", text: "Gram-positive cells stay purple [1]." },
        { kind: "media", caption: "A stain.", alt: "Cells.", descriptor: { ...DESCRIPTOR, license: "cc_by_nc" } },
        { kind: "media", caption: "A stain.", alt: "Cells.", descriptor: { ...DESCRIPTOR, storageKey: "../secrets" } },
        { kind: "media", caption: "A stain.", alt: "Cells.", descriptor: { storageKey: DESCRIPTOR.storageKey } },
      ],
    }],
  });
  assert.deepEqual(body?.sections[0]?.blocks.map((block) => block.kind), ["prose"]);
});

test("A reading body keeps a well-formed glossary, each term once, and drops it when empty (SEN-48)", () => {
  const sections = [{ heading: "Walls", blocks: [{ kind: "prose", text: "Peptidoglycan is a mesh [1]." }] }];
  assert.deepEqual(parseReadingBody({ sections, glossary: [
    { term: " Peptidoglycan ", definition: "The mesh that makes up a bacterial wall." },
    { term: "peptidoglycan", definition: "A repeat." },
    { term: "", definition: "No term." },
    { term: "mordant", definition: 3 },
  ] })?.glossary, [{ term: "Peptidoglycan", definition: "The mesh that makes up a bacterial wall." }]);
  assert.equal(parseReadingBody({ sections, glossary: [] })?.glossary, undefined);
  assert.equal(parseGlossary(Array.from({ length: 20 }, (_, n) => ({ term: `t${n}`, definition: "d" }))).length, MAX_GLOSSARY_TERMS);
});

test("A glossary term is found as a whole word or phrase, ignoring case", () => {
  assert.equal(mentionsTerm("The Cell Wall lies outside [1].", "cell wall"), true);
  assert.equal(mentionsTerm("Crystal violet (a dye) stains it.", "crystal violet"), true);
  assert.equal(mentionsTerm("A membranes list.", "membrane"), false);
  assert.equal(mentionsTerm("Gram-positive cells.", "Gram"), true);
  assert.equal(mentionsTerm("Anything.", "  "), false);
});

test("A Reading's word count skips Citation markers and media, in a stored body and in a draft alike", () => {
  const body = parseReadingBody({ sections: [
    { heading: "Walls", blocks: [{ kind: "prose", text: "Peptidoglycan is a mesh [1]. It is thick [1][2]." }, { kind: "media", descriptor: DESCRIPTOR, caption: "c", alt: "a" }] },
    { heading: "Dyes", blocks: [{ kind: "prose", text: "Crystal violet  stains  it [src_0123456789]." }] },
  ] });
  assert.equal(readingWordCount(body!), 11);
  assert.equal(readingWordCount({ sections: [] }), 0);
});
