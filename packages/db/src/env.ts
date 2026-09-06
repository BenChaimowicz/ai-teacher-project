import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walks up from a file to the monorepo root.
 * @param importMetaUrl - `import.meta.url` of the calling file
 * @param depthToRoot - How many directories above that file the repo root is
 * @returns Absolute path to the repo root
 */
export function repoRootFrom(importMetaUrl: string, depthToRoot: number) {
  let dir = fileURLToPath(new URL(".", importMetaUrl));
  for (let i = 0; i < depthToRoot; i += 1) {
    dir = resolve(dir, "..");
  }
  return dir;
}

/**
 * Loads the repo-root `.env` into `process.env`.
 * @param importMetaUrl - `import.meta.url` of the calling file
 * @param depthToRoot - How many directories above that file the repo root is
 * @returns Absolute path to the repo root
 */
export function loadRootEnv(importMetaUrl: string, depthToRoot: number) {
  try {
    const root = repoRootFrom(importMetaUrl, depthToRoot);
    config({ path: resolve(root, ".env") });
    return root;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[env.ts: loadRootEnv] Failed to load root .env || depthToRoot=${depthToRoot} || ${message}`,
    );
  }
}
