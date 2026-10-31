import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaDescriptorFailures, type MediaDescriptorFields, type MediaLicense } from "./media.ts";

/** A valid CC BY-SA library still, the strictest licence the catalog hosts. */
function descriptor(overrides: Partial<MediaDescriptorFields> = {}): MediaDescriptorFields {
  return {
    id: "d0a1e001-0000-4000-8000-000000000001",
    kind: "image",
    origin: "library",
    license: "cc_by_sa",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    caption: "Matched grip on a snare drum, seen from above.",
    alt: "Two hands holding drumsticks palms-down over a snare drum.",
    source: { title: "File:Matchedsnaregrip.jpg", author: "Woolters", url: "https://commons.wikimedia.org/wiki/File:Matchedsnaregrip.jpg" },
    storageKey: "library/drums/matched-snare-grip.jpg",
    mimeType: "image/jpeg",
    byteSize: 188_416,
    sha256: "a".repeat(64),
    width: 1280,
    height: 800,
    mediaCategory: "drum-grip",
    topicTags: ["matched-grip", "snare"],
    ...overrides,
  };
}

test("a fully attributed CC BY-SA still is valid", () => {
  assert.deepEqual(mediaDescriptorFailures(descriptor()), []);
});

test("a public-domain file needs its source page but no licence URL", () => {
  assert.deepEqual(mediaDescriptorFailures(descriptor({ license: "public_domain", licenseUrl: null })), []);
});

test("a product-owned file has no source page and needs no licence URL", () => {
  assert.deepEqual(mediaDescriptorFailures(descriptor({ license: "product_owned", licenseUrl: null, source: null })), []);
  assert.match(mediaDescriptorFailures(descriptor({ license: "product_owned", licenseUrl: null }))[0]!, /no source page/);
});

test("CC BY and CC BY-SA require title, author, source URL and licence URL", () => {
  for (const license of ["cc_by", "cc_by_sa"] as const) {
    assert.match(mediaDescriptorFailures(descriptor({ license, licenseUrl: null }))[0]!, /requires a licence URL/);
    const noAuthor = descriptor({ license, source: { title: "File:X.jpg", author: " ", url: "https://commons.wikimedia.org/wiki/File:X.jpg" } });
    assert.match(mediaDescriptorFailures(noAuthor)[0]!, /author is empty/);
  }
});

test("a licence the product cannot host is rejected even when forced past the type", () => {
  const failures = mediaDescriptorFailures(descriptor({ license: "cc_by_nc" as MediaLicense }));
  assert.match(failures[0]!, /not one the product can host/);
});

test("a file taken from elsewhere must say where", () => {
  assert.match(mediaDescriptorFailures(descriptor({ source: null }))[0]!, /needs its source page/);
  const badUrl = descriptor({ source: { title: "t", author: "a", url: "commons.wikimedia.org/wiki/File:X.jpg" } });
  assert.match(mediaDescriptorFailures(badUrl)[0]!, /not an http\(s\) URL/);
});

test("caption, alt text and at least one Topic tag are required", () => {
  assert.match(mediaDescriptorFailures(descriptor({ caption: "  " }))[0]!, /caption is empty/);
  assert.match(mediaDescriptorFailures(descriptor({ alt: "" }))[0]!, /alt text is empty/);
  assert.match(mediaDescriptorFailures(descriptor({ topicTags: [] }))[0]!, /At least one Topic tag/);
  assert.match(mediaDescriptorFailures(descriptor({ topicTags: ["Matched Grip"] }))[0]!, /not lowercase kebab-case/);
});

test("storage keys are lowercase path segments and the digest is hex", () => {
  assert.match(mediaDescriptorFailures(descriptor({ storageKey: "Library/Drums/Grip.jpg" }))[0]!, /not lowercase path segments/);
  assert.match(mediaDescriptorFailures(descriptor({ storageKey: "/library/grip.jpg" }))[0]!, /not lowercase path segments/);
  assert.match(mediaDescriptorFailures(descriptor({ storageKey: "library//grip.jpg" }))[0]!, /not lowercase path segments/);
  assert.match(mediaDescriptorFailures(descriptor({ sha256: "xyz" }))[0]!, /64 lowercase hex/);
  assert.match(mediaDescriptorFailures(descriptor({ byteSize: 0 }))[0]!, /positive integer/);
});

test("an unknown Media category is rejected", () => {
  const failures = mediaDescriptorFailures(descriptor({ mediaCategory: "cat-pictures" as MediaDescriptorFields["mediaCategory"] }));
  assert.match(failures[0]!, /Media category "cat-pictures" is unknown/);
});

test("every failure is reported, not only the first", () => {
  const failures = mediaDescriptorFailures(descriptor({ caption: "", alt: "", topicTags: [] }));
  assert.equal(failures.length, 3);
});
