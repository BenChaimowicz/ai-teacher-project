import { createDb, loadRootEnv } from "@senoy/db";
import { CATALOG } from "./entries.ts";
import { resolveCatalog } from "./catalog.ts";
import { seedMediaCatalog } from "./seed-catalog.ts";
import { createMediaStorage, mediaStorageConfigFromEnv } from "./storage.ts";

try {
  loadRootEnv(import.meta.url, 3);

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
  }
  const storage = createMediaStorage(mediaStorageConfigFromEnv());
  const db = createDb(url, { max: 1 });

  const entries = await resolveCatalog(CATALOG);
  console.log(`Catalog resolved: ${entries.length} files`);
  const outcome = await seedMediaCatalog(db, storage, entries);
  console.log(`Uploaded ${outcome.uploaded.length} files, ${outcome.unchangedBytes.length} already in the bucket`);
  console.log(`Wrote ${outcome.written.length} descriptors, ${outcome.unchangedDescriptors.length} already matched`);
  for (const key of outcome.uploaded) console.log(`  uploaded ${key}`);
  for (const id of outcome.written) console.log(`  wrote ${id}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`[seed.ts] Media seed failed || ${message}`);
}

process.exit(0);
