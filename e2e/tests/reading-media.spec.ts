import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createDb, publishedLessons, SEEDED_COURSE_ID, SEEDED_READING_LESSON_ID, type ReadingBody } from "@senoy/db";
import { CATALOG, CATALOG_DIR, resolveCatalogEntry } from "@senoy/media";
import { resetFixture } from "./fixture.ts";

const db = createDb(process.env.DATABASE_URL!, { max: 1 });

/** The Frølich Yggdrasil plate as the seed catalog resolves it; `pnpm media:seed` put its bytes in the private bucket. */
async function plate() {
  const entry = CATALOG.find((candidate) => candidate.file === "norse/yggdrasil-frolich.jpg");
  if (!entry) throw new Error("[reading-media.spec.ts: plate] The seed catalog has no Yggdrasil plate");
  return resolveCatalogEntry(entry, await readFile(resolve(CATALOG_DIR, entry.file))).descriptor;
}

test("A Reading's media block shows the file from /media with its caption, alt text, and credit; unshipped files stay private", async ({ page }) => {
  await resetFixture();
  const descriptor = await plate();
  const [lesson] = await db.select({ body: publishedLessons.body }).from(publishedLessons).where(eq(publishedLessons.id, SEEDED_READING_LESSON_ID));
  const body = lesson!.body as ReadingBody;
  const caption = "One artist's depiction of Yggdrasil, the world tree.";
  const alt = "An engraving of a great ash tree whose roots and branches spread across the picture.";
  body.sections[0]!.blocks.push({ kind: "media", caption, alt, descriptor });
  await db.update(publishedLessons).set({ body }).where(eq(publishedLessons.id, SEEDED_READING_LESSON_ID));

  await page.goto(`/study/${SEEDED_COURSE_ID}/lessons/${SEEDED_READING_LESSON_ID}`);
  const figure = page.getByRole("figure");
  await expect(figure).toHaveCount(1);
  const image = figure.getByRole("img", { name: alt });
  await expect(image).toHaveAttribute("src", `/media/${descriptor.storageKey}`);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)).toBe(descriptor.width);
  await expect(figure).toContainText(caption);
  await expect(figure.getByRole("link", { name: descriptor.source!.title })).toHaveAttribute("href", descriptor.source!.url);
  await expect(figure).toContainText("Public domain");

  const shown = await page.request.get(`/media/${descriptor.storageKey}`);
  expect(shown.status()).toBe(200);
  expect(shown.headers()["content-type"]).toBe("image/jpeg");
  expect((await shown.body()).byteLength).toBe(descriptor.byteSize);
  // A library file no published Lesson shows is not served, though it is in the bucket.
  expect((await page.request.get("/media/library/norse/thor-frolich.jpg")).status()).toBe(404);
});
