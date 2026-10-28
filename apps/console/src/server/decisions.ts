import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { DECISION_STATUSES, type DecisionStatus, type OpsDecision, type OpsDecisionLog } from "@senoy/db/usage";

/** Reads the team's decision log from `docs/decisions/`. */
export type DecisionsReader = () => Promise<OpsDecisionLog>;

/** A `date:` must be exactly this; anything looser makes the log impossible to order. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Files in the folder that are documentation about the log, not entries in it. */
const NOT_ENTRIES = new Set(["readme.md"]);

/**
 * Splits a comma-separated front matter value into trimmed items, tolerating a `[a, b]` wrapper.
 * @param raw - The value as written, or undefined when the key is absent
 * @returns The items, without empties
 */
function list(raw: string | undefined): string[] {
  const text = (raw ?? "").trim().replace(/^\[(.*)\]$/s, "$1");
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Reads an entry's `--- ... ---` front matter into keys, leaving the body untouched.
 * @param text - The whole file
 * @returns The front matter keys (lowercased) and the body below it
 * @throws Error when the file does not open with front matter
 */
export function splitFrontMatter(text: string): { keys: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.replace(/^﻿/, ""));
  if (!match) throw new Error("[decisions.ts: splitFrontMatter] The entry does not start with --- front matter");
  const keys: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const at = line.indexOf(":");
    if (at === -1) throw new Error(`[decisions.ts: splitFrontMatter] Front matter line has no "key: value" || line=${line.trim()}`);
    keys[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  return { keys, body: match[2] };
}

/**
 * Turns one decision file into an entry: front matter for when / who / what it touched, the `#` heading for the
 * decision, and everything under it for the why.
 * @param id - The file name without `.md`
 * @param path - Repo-relative path, kept so the console can say which file to edit
 * @param text - The file's contents
 * @returns The entry
 * @throws Error when the front matter or the heading is missing or malformed
 */
export function parseDecision(id: string, path: string, text: string): OpsDecision {
  const { keys, body } = splitFrontMatter(text);

  const when = (keys.date ?? "").trim();
  if (!DATE_PATTERN.test(when)) {
    throw new Error(`[decisions.ts: parseDecision] date must be YYYY-MM-DD, so entries can be ordered || date=${when || "(missing)"}`);
  }

  const heading = /^#\s+(.+?)\s*$/m.exec(body);
  if (!heading) throw new Error("[decisions.ts: parseDecision] The entry has no `# ` heading, which is the decision itself");

  const status = (keys.status ?? "active").trim() || "active";
  if (!(DECISION_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`[decisions.ts: parseDecision] Unknown status || status=${status} || expected ${DECISION_STATUSES.join(", ")}`);
  }

  return {
    id,
    decision: heading[1],
    why: body.slice((heading.index ?? 0) + heading[0].length).trim(),
    when,
    tickets: list(keys.tickets),
    people: list(keys.people),
    status: status as DecisionStatus,
    supersedes: list(keys.supersedes),
    path,
  };
}

/**
 * Builds the reader for `GET /api/ops/decisions`. The folder is read on every call — not cached and not bundled — so
 * an entry written during a session shows on the console's next refresh.
 * @param options.root - The repo root
 * @param options.folder - Where entries live, relative to the root
 * @param options.now - The current instant, injected for tests
 * @returns The reader
 */
export function createDecisionsReader({
  root,
  folder = "docs/decisions",
  now = () => new Date(),
}: {
  root: string;
  folder?: string;
  now?: () => Date;
}): DecisionsReader {
  const dir = join(root, ...folder.split("/"));

  return async () => {
    const decisions: OpsDecision[] = [];
    const problems: { path: string; problem: string }[] = [];

    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      // No folder yet is an empty log, not a failure: the console's empty state says how to start one.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { decisions, problems, folder, readAt: now().toISOString() };
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[decisions.ts: createDecisionsReader] Failed to read the decision log || dir=${dir} || ${message}`);
    }

    for (const name of names.sort()) {
      if (!name.endsWith(".md") || NOT_ENTRIES.has(name.toLowerCase())) continue;
      const shown = relative(root, join(dir, name)).split(sep).join(posix.sep);
      try {
        decisions.push(parseDecision(name.slice(0, -3), shown, await readFile(join(dir, name), "utf8")));
      } catch (error) {
        problems.push({ path: shown, problem: error instanceof Error ? error.message : String(error) });
      }
    }

    decisions.sort((a, b) => b.when.localeCompare(a.when) || b.id.localeCompare(a.id));
    return { decisions, problems, folder, readAt: now().toISOString() };
  };
}
