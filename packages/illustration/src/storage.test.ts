import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaDescriptorFailures, parseMediaDescriptorFields, type VisualBrief } from "@senoy/db";
import { sha256Of } from "@senoy/media";
import { generatedDescriptor, generatedDescriptorId, generatedStorageKey, GENERATED_KEY_PREFIX } from "./storage.ts";

const brief: VisualBrief = {
  kind: "depiction",
  subject: "Yggdrasil, the Norse world ash, and the beings around it",
  mustShow: ["exactly three roots", "the Well of Urðr at one root"],
  caption: "Yggdrasil, with the Norns at the well and Níðhöggr at a root.",
  alt: "A wide ash tree with three roots; three women by a well at one root, a red serpent biting another, an eagle on top.",
  mediaCategory: "norse-mythic-depiction",
  topicTags: ["yggdrasil", "norns"],
};

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("a drawn illustration is filed under generated/, product-owned, with the brief's words and the PNG's digest", () => {
  const descriptor = generatedDescriptor(brief, png);
  const sha256 = sha256Of(png);
  assert.deepEqual(mediaDescriptorFailures(descriptor), []);
  assert.equal(descriptor.storageKey, `${GENERATED_KEY_PREFIX}${sha256}.png`);
  assert.equal(descriptor.origin, "generated");
  assert.equal(descriptor.license, "product_owned");
  assert.equal(descriptor.source, null);
  assert.equal(descriptor.caption, brief.caption);
  assert.equal(descriptor.alt, brief.alt);
  assert.equal(descriptor.mediaCategory, brief.mediaCategory);
  assert.deepEqual(descriptor.topicTags, brief.topicTags);
  assert.equal(descriptor.byteSize, png.byteLength);
  assert.deepEqual([descriptor.width, descriptor.height], [1200, 800]);
  assert.deepEqual(parseMediaDescriptorFields(JSON.parse(JSON.stringify(descriptor))), descriptor, "It survives a Lesson's media block.");
});

test("the same bytes always get the same key and the same UUID-shaped id", () => {
  const sha256 = sha256Of(png);
  assert.equal(generatedStorageKey(sha256), generatedDescriptor(brief, png).storageKey);
  const id = generatedDescriptorId(sha256);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(generatedDescriptorId(sha256), id);
  assert.notEqual(generatedDescriptorId(sha256Of(new Uint8Array([1]))), id);
});

test("a brief that makes no valid descriptor is refused with the rule broken", () => {
  assert.throws(() => generatedDescriptor({ ...brief, caption: " " }, png), /\[storage\.ts: generatedDescriptor\] .* \|\| category=norse-mythic-depiction \|\| The caption is empty\./);
});
