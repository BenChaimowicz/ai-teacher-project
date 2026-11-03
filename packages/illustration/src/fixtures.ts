import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseScenePlan, type ScenePlan } from "./scene-plan.ts";

/** Where the committed scene plans and their renders live. */
export const FIXTURES_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../fixtures");

/**
 * Reads one committed fixture plan.
 * @param name - The fixture's file name without extension, such as `yggdrasil`
 * @returns The parsed plan
 * @throws Error when the file is missing, is not JSON, or is not a plan that can be drawn
 */
export async function readFixture(name: string): Promise<ScenePlan> {
  const path = resolve(FIXTURES_DIR, `${name}.json`);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[fixtures.ts: readFixture] Could not read a fixture plan || path=${path} || ${message}`);
  }
  return parseScenePlan(raw);
}
