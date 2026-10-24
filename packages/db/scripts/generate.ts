import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** One entry of drizzle-kit's migration journal. */
type JournalEntry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };

/** The journal file drizzle-kit writes and the migrator reads. */
type Journal = { version: string; dialect: string; entries: JournalEntry[] };

const drizzleDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../drizzle");
const journalPath = resolve(drizzleDir, "meta/_journal.json");

/**
 * Reads the migration journal.
 * @returns The parsed journal
 */
function readJournal(): Journal {
  try {
    return JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[generate.ts: readJournal] Failed to read the migration journal || path=${journalPath} || ${message}`);
  }
}

/**
 * A UTC `YYYYMMDDHHmmss` stamp for a journal `when`.
 * @param when - Milliseconds since the epoch
 */
function stampOf(when: number) {
  return new Date(when).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/**
 * Runs `drizzle-kit generate` with the given arguments, then stamps every new migration: its file becomes
 * `<number>_<UTC timestamp>_<name>.sql` and its journal tag matches. The number keeps drizzle's order; the timestamp
 * shows when it was made, so migrations from parallel branches are easy to tell apart and re-stamp.
 */
function generate() {
  const before = new Set(readJournal().entries.map((entry) => entry.tag));
  const result = spawnSync("drizzle-kit", ["generate", ...process.argv.slice(2)], { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);

  const journal = readJournal();
  for (const entry of journal.entries.filter((candidate) => !before.has(candidate.tag))) {
    const [number, ...rest] = entry.tag.split("_");
    const stamped = `${number}_${stampOf(entry.when)}_${rest.join("_")}`;
    try {
      renameSync(resolve(drizzleDir, `${entry.tag}.sql`), resolve(drizzleDir, `${stamped}.sql`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[generate.ts: generate] Failed to rename a new migration || tag=${entry.tag} || ${message}`);
    }
    entry.tag = stamped;
    process.stdout.write(`Stamped migration ${stamped}.sql\n`);
  }
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
}

generate();
