import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReadingBody } from "./reading-lesson.ts";

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
