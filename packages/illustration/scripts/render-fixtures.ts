/**
 * Draws every scene plan in `fixtures/` to a PNG beside it and prints how long each took, cold and warm. Run with
 * `pnpm --filter @senoy/illustration fixtures`. The PNGs are committed so a reviewer can look at them.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FIXTURES_DIR, readFixture } from "../src/fixtures.ts";
import { renderScenePlan } from "../src/render.ts";

/**
 * Renders one fixture and reports its timing.
 * @param name - The fixture's file name, without extension
 * @param label - `cold` or `warm`
 */
async function render(name: string, label: string): Promise<void> {
  const plan = await readFixture(name);
  const start = performance.now();
  const { png, svg, labels } = renderScenePlan(plan);
  const took = performance.now() - start;
  writeFileSync(resolve(FIXTURES_DIR, `${name}.png`), png);
  if (process.argv.includes("--svg")) writeFileSync(resolve(FIXTURES_DIR, `${name}.svg`), svg);
  const crowded = labels.filter((placed) => placed.crowded).length;
  console.log(`${name.padEnd(12)} ${label.padEnd(5)} ${took.toFixed(0).padStart(5)} ms  ${(png.byteLength / 1024).toFixed(0).padStart(5)} KB  ${labels.length} labels${crowded ? ` (${crowded} crowded)` : ""}`);
}

const names = readdirSync(FIXTURES_DIR).filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""));
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
for (const name of names) {
  if (only.length > 0 && !only.includes(name)) continue;
  await render(name, "cold");
  await render(name, "warm");
}
