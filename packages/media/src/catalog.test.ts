import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { MediaDescriptorFields } from "@senoy/db";
import { resolveCatalog, resolveCatalogEntry, type CatalogEntry } from "./catalog.ts";
import { descriptorChanged, needsUpload, seedMediaCatalog } from "./seed-catalog.ts";
import { sha256Of, type MediaStorage } from "./storage.ts";

/** A 1×1 transparent PNG. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A minimal SVG with a viewBox. */
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>');

/** A hand-written public-domain entry for the 1×1 PNG. */
function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "d0a1e001-0000-4000-8000-000000000001",
    file: "micro/dot.png",
    kind: "image",
    origin: "library",
    license: "public_domain",
    licenseUrl: null,
    caption: "A single dot.",
    alt: "One transparent pixel.",
    source: { title: "File:Dot.png", author: "Nobody", url: "https://commons.wikimedia.org/wiki/File:Dot.png" },
    mediaCategory: "gram-stain-result",
    topicTags: ["dot"],
    ...overrides,
  };
}

test("resolving an entry derives key, MIME type, size, digest and dimensions from the file", () => {
  const { descriptor } = resolveCatalogEntry(entry(), PNG_1X1);
  assert.equal(descriptor.storageKey, "library/micro/dot.png");
  assert.equal(descriptor.mimeType, "image/png");
  assert.equal(descriptor.byteSize, PNG_1X1.byteLength);
  assert.equal(descriptor.sha256, sha256Of(PNG_1X1));
  assert.equal(descriptor.width, 1);
  assert.equal(descriptor.height, 1);
  assert.equal("file" in descriptor, false);
});

test("an SVG's dimensions come from its viewBox and unsafe SVG is refused", () => {
  const { descriptor } = resolveCatalogEntry(entry({ file: "drums/legend.svg" }), SVG);
  assert.equal(descriptor.mimeType, "image/svg+xml");
  assert.equal(descriptor.width, 20);
  assert.equal(descriptor.height, 10);
  const scripted = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.throws(() => resolveCatalogEntry(entry({ file: "drums/legend.svg" }), scripted), /script, foreignObject/);
  const remote = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>');
  assert.throws(() => resolveCatalogEntry(entry({ file: "drums/legend.svg" }), remote), /script, foreignObject/);
});

test("an unknown extension is refused", () => {
  assert.throws(() => resolveCatalogEntry(entry({ file: "micro/dot.bmp" }), PNG_1X1), /Unsupported file extension/);
});

test("resolving a directory reports every problem at once: invalid descriptor, duplicate id, missing and unclaimed files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-catalog-"));
  await mkdir(join(dir, "micro"), { recursive: true });
  await writeFile(join(dir, "micro/dot.png"), PNG_1X1);
  await writeFile(join(dir, "micro/other.png"), PNG_1X1);
  await writeFile(join(dir, "micro/stray.png"), PNG_1X1);

  const entries: CatalogEntry[] = [
    entry(),
    entry({ file: "micro/other.png", caption: " " }),
    entry({ file: "micro/missing.png", id: "d0a1e001-0000-4000-8000-000000000002" }),
  ];
  await assert.rejects(resolveCatalog(entries, dir), (error: Error) => {
    assert.match(error.message, /problems=4/);
    assert.match(error.message, /micro\/other\.png: id d0a1e001-0000-4000-8000-000000000001 is used twice/);
    assert.match(error.message, /micro\/other\.png: The caption is empty/);
    assert.match(error.message, /micro\/missing\.png: cannot read the file/);
    assert.match(error.message, /micro\/stray\.png: on disk but not in the catalog/);
    return true;
  });
});

test("a valid directory resolves in catalog order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-catalog-"));
  await mkdir(join(dir, "micro"), { recursive: true });
  await writeFile(join(dir, "micro/dot.png"), PNG_1X1);
  const resolved = await resolveCatalog([entry()], dir);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]!.descriptor.storageKey, "library/micro/dot.png");
});

test("bytes are uploaded when the bucket has no object, a different digest, or no recorded digest", () => {
  const { descriptor } = resolveCatalogEntry(entry(), PNG_1X1);
  assert.equal(needsUpload(descriptor, null), true);
  assert.equal(needsUpload(descriptor, { sha256: "0".repeat(64) }), true);
  assert.equal(needsUpload(descriptor, { sha256: null }), true);
  assert.equal(needsUpload(descriptor, { sha256: descriptor.sha256 }), false);
});

test("a descriptor is rewritten only when a catalog-owned field differs", () => {
  const { descriptor } = resolveCatalogEntry(entry(), PNG_1X1);
  assert.equal(descriptorChanged(descriptor, undefined), true);
  assert.equal(descriptorChanged(descriptor, { ...descriptor }), false);
  assert.equal(descriptorChanged(descriptor, { ...descriptor, topicTags: ["dot", "pixel"] }), true);
  assert.equal(descriptorChanged(descriptor, { ...descriptor, caption: "Changed." }), true);
});

test("a source that Postgres jsonb handed back with its keys reordered is not a change", () => {
  const { descriptor } = resolveCatalogEntry(entry(), PNG_1X1);
  const { title, author, url } = descriptor.source!;
  assert.equal(descriptorChanged(descriptor, { ...descriptor, source: { url, title, author } }), false);
  assert.equal(descriptorChanged(descriptor, { ...descriptor, source: { url, title, author: "Someone else" } }), true);
});

/** A bucket in memory. */
function fakeStorage(): MediaStorage & { objects: Map<string, Uint8Array>; puts: number } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    puts: 0,
    async put(key, body) {
      this.puts += 1;
      objects.set(key, body);
    },
    async head(key) {
      const body = objects.get(key);
      return body ? { sha256: sha256Of(body), byteSize: body.byteLength } : null;
    },
    async get() {
      throw new Error("not used");
    },
  };
}

/** The slice of Drizzle the seed uses, over a map of rows by id. */
function fakeDb(rows: Map<string, MediaDescriptorFields & { createdAt: Date; updatedAt: Date }>) {
  let writes = 0;
  const db = {
    get writes() {
      return writes;
    },
    select: () => ({
      from: () => ({
        where: (condition: { queryChunks: unknown[] }) => ({
          limit: async () => {
            // `eq(column, id)` renders as [column, " = ", Param]; the Param is the only chunk whose value is a string.
            const id = (condition.queryChunks as { value?: unknown }[]).find((chunk) => typeof chunk?.value === "string")?.value as string;
            const row = rows.get(id);
            return row ? [row] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (value: MediaDescriptorFields) => ({
        onConflictDoUpdate: async () => {
          writes += 1;
          const now = new Date();
          rows.set(value.id, { ...value, createdAt: rows.get(value.id)?.createdAt ?? now, updatedAt: now });
        },
      }),
    }),
  };
  return db;
}

test("seeding twice uploads and writes on the first run and nothing on the second", async () => {
  const storage = fakeStorage();
  const rows = new Map();
  const db = fakeDb(rows);
  const entries = [resolveCatalogEntry(entry(), PNG_1X1)];

  const first = await seedMediaCatalog(db as never, storage, entries);
  assert.deepEqual(first.uploaded, ["library/micro/dot.png"]);
  assert.deepEqual(first.written, [entry().id]);
  assert.equal(storage.puts, 1);
  assert.equal(db.writes, 1);

  const second = await seedMediaCatalog(db as never, storage, entries);
  assert.deepEqual(second.uploaded, []);
  assert.deepEqual(second.written, []);
  assert.deepEqual(second.unchangedBytes, ["library/micro/dot.png"]);
  assert.deepEqual(second.unchangedDescriptors, [entry().id]);
  assert.equal(storage.puts, 1);
  assert.equal(db.writes, 1);
});

test("a changed caption rewrites the descriptor without re-uploading unchanged bytes", async () => {
  const storage = fakeStorage();
  const rows = new Map();
  const db = fakeDb(rows);
  await seedMediaCatalog(db as never, storage, [resolveCatalogEntry(entry(), PNG_1X1)]);

  const outcome = await seedMediaCatalog(db as never, storage, [resolveCatalogEntry(entry({ caption: "A better caption." }), PNG_1X1)]);
  assert.deepEqual(outcome.uploaded, []);
  assert.deepEqual(outcome.written, [entry().id]);
  assert.equal(storage.puts, 1);
  assert.equal(db.writes, 2);
});
