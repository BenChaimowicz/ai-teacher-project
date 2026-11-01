import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { imageSize } from "image-size";
import { CATALOG_DIR } from "./catalog.ts";
import { CATALOG } from "./entries.ts";
import { isUnsafeSvg, rasterizeSvg } from "./svg.ts";

test("scripts, embedded HTML, event handlers and remote references make an SVG unsafe; a plain diagram is safe", () => {
  const svg = (inner: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">${inner}</svg>`);
  assert.equal(isUnsafeSvg(svg('<rect width="20" height="10"/><text x="1" y="9">Snare</text>')), false);
  assert.equal(isUnsafeSvg(svg('<marker id="a"/><path d="M0 0" marker-end="url(#a)"/>')), false, "A local marker reference is not remote.");
  assert.equal(isUnsafeSvg(svg("<script>alert(1)</script>")), true);
  assert.equal(isUnsafeSvg(svg("<foreignObject><div/></foreignObject>")), true);
  assert.equal(isUnsafeSvg(svg('<rect onclick="x()"/>')), true);
  assert.equal(isUnsafeSvg(svg('<image href="//evil.example/x.png"/>')), true);
});

test("every catalog SVG is safe and draws as a 1600-pixel-wide PNG", async () => {
  const diagrams = CATALOG.filter((entry) => entry.file.endsWith(".svg"));
  assert.ok(diagrams.some((entry) => entry.mediaCategory === "drum-stroke"), "The rebound stroke strip is in the catalog.");
  for (const entry of diagrams) {
    const bytes = await readFile(resolve(CATALOG_DIR, entry.file));
    assert.equal(isUnsafeSvg(bytes), false, entry.file);
    const png = rasterizeSvg(bytes);
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${entry.file} draws as a PNG`);
    assert.equal(imageSize(png).width, 1600, entry.file);
  }
});

test("markup that is not an SVG cannot be drawn", () => {
  assert.throws(() => rasterizeSvg(Buffer.from("not an svg")), /\[svg\.ts: rasterizeSvg\] Failed to draw an SVG/);
});
