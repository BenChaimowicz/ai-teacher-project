/**
 * Where a drawn illustration goes and how it is described: generated PNGs live beside the library under their own
 * key prefix in the same private bucket, named by their digest so the same picture is never stored twice, and their
 * descriptor is product-owned, with origin `generated`, filed under the brief's category and tags.
 */
import { mediaDescriptorFailures, type MediaDescriptorFields, type VisualBrief } from "@senoy/db";
import { sha256Of } from "@senoy/media";
import { CANVAS } from "./style.ts";

/** Where generated files live in the bucket, beside `library/`; `/media/generated/…` serves them like any other key. */
export const GENERATED_KEY_PREFIX = "generated/";

/**
 * The storage key of a generated PNG: its digest, so re-rendering the same plan finds the same object.
 * @param sha256 - The PNG's lowercase hex SHA-256
 */
export function generatedStorageKey(sha256: string): string {
  return `${GENERATED_KEY_PREFIX}${sha256}.png`;
}

/**
 * A stable descriptor id for a generated file, derived from its digest in the UUID shape the `media_descriptors`
 * table takes (version 8, the custom-format version), so the same PNG always gets the same id.
 * @param sha256 - The PNG's lowercase hex SHA-256
 */
export function generatedDescriptorId(sha256: string): string {
  const h = sha256.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * The descriptor of a rendered illustration, ready for `media_descriptors` and a Lesson's media block: product-owned,
 * origin `generated`, the brief's caption, alt, category and tags, and the PNG's digest, size and dimensions.
 * @param brief - What the Reading writer asked for
 * @param png - What {@link renderScenePlan} drew
 * @returns The descriptor
 * @throws Error when the brief and bytes do not make a valid descriptor, naming every rule broken
 */
export function generatedDescriptor(brief: VisualBrief, png: Uint8Array): MediaDescriptorFields {
  const sha256 = sha256Of(png);
  const descriptor: MediaDescriptorFields = {
    id: generatedDescriptorId(sha256),
    kind: "image",
    origin: "generated",
    license: "product_owned",
    licenseUrl: null,
    caption: brief.caption,
    alt: brief.alt,
    source: null,
    storageKey: generatedStorageKey(sha256),
    mimeType: "image/png",
    byteSize: png.byteLength,
    sha256,
    width: CANVAS.width,
    height: CANVAS.height,
    mediaCategory: brief.mediaCategory,
    topicTags: brief.topicTags,
  };
  const failures = mediaDescriptorFailures(descriptor);
  if (failures.length > 0) {
    throw new Error(`[storage.ts: generatedDescriptor] The drawn illustration does not make a valid descriptor || category=${brief.mediaCategory} || ${failures.join(" ")}`);
  }
  return descriptor;
}
