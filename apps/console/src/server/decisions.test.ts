import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createDecisionsReader, parseDecision, splitFrontMatter } from "./decisions.ts";

const NOW = new Date("2026-10-28T09:00:00.000Z");

/** A well-formed entry, so each test only writes the part it is about. */
function entry(front: string, body = "# We do the thing\n\n**Why:** Because of the reason.") {
  return `---\n${front}\n---\n\n${body}\n`;
}

describe("parseDecision", () => {
  it("reads the decision, the why, and the front matter", () => {
    const decision = parseDecision(
      "2026-10-27-slug",
      "docs/decisions/2026-10-27-slug.md",
      entry("date: 2026-10-27\ntickets: SEN-105, SEN-85\npeople: Yarden, Ben\nstatus: superseded\nsupersedes: 2026-10-01-old"),
    );
    assert.equal(decision.decision, "We do the thing");
    assert.equal(decision.why, "**Why:** Because of the reason.");
    assert.equal(decision.when, "2026-10-27");
    assert.deepEqual(decision.tickets, ["SEN-105", "SEN-85"]);
    assert.deepEqual(decision.people, ["Yarden", "Ben"]);
    assert.equal(decision.status, "superseded");
    assert.deepEqual(decision.supersedes, ["2026-10-01-old"]);
    assert.equal(decision.path, "docs/decisions/2026-10-27-slug.md");
  });

  it("defaults the status to active and the lists to empty", () => {
    const decision = parseDecision("id", "p.md", entry("date: 2026-10-27\ntickets:"));
    assert.equal(decision.status, "active");
    assert.deepEqual(decision.tickets, []);
    assert.deepEqual(decision.people, []);
  });

  it("keeps the whole body under the heading as the why", () => {
    const decision = parseDecision("id", "p.md", entry("date: 2026-10-27", "# Heading\n\nFirst.\n\n- a\n- b\n"));
    assert.equal(decision.why, "First.\n\n- a\n- b");
  });

  it("rejects a missing or malformed date", () => {
    assert.throws(() => parseDecision("id", "p.md", entry("people: Yarden")), /date must be YYYY-MM-DD/);
    assert.throws(() => parseDecision("id", "p.md", entry("date: 27 Oct 2026")), /date must be YYYY-MM-DD/);
  });

  it("rejects an entry with no heading and an unknown status", () => {
    assert.throws(() => parseDecision("id", "p.md", entry("date: 2026-10-27", "Just prose.")), /no `# ` heading/);
    assert.throws(() => parseDecision("id", "p.md", entry("date: 2026-10-27\nstatus: maybe")), /Unknown status/);
  });

  it("rejects a file with no front matter", () => {
    assert.throws(() => splitFrontMatter("# Decision\n\nWhy.\n"), /does not start with --- front matter/);
  });
});

describe("createDecisionsReader", () => {
  let dir: string;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "decisions-"));
    await writeFile(join(dir, "README.md"), "# Decision log\n\nNot an entry.\n");
    await writeFile(join(dir, "2026-10-01-older.md"), entry("date: 2026-10-01", "# Older\n\nWhy."));
    await writeFile(join(dir, "2026-10-27-newer.md"), entry("date: 2026-10-27", "# Newer\n\nWhy."));
    await writeFile(join(dir, "broken.md"), "no front matter\n");
    await writeFile(join(dir, "notes.txt"), "ignored");
  });

  after(async () => rm(dir, { recursive: true, force: true }));

  it("reads entries newest first, skipping the README and non-Markdown", async () => {
    const log = await createDecisionsReader({ root: dir, folder: ".", now: () => NOW })();
    assert.deepEqual(log.decisions.map((d) => d.decision), ["Newer", "Older"]);
    assert.equal(log.readAt, NOW.toISOString());
  });

  it("reports an unreadable entry instead of dropping it", async () => {
    const log = await createDecisionsReader({ root: dir, folder: ".", now: () => NOW })();
    assert.equal(log.problems.length, 1);
    assert.match(log.problems[0].path, /broken\.md$/);
    assert.match(log.problems[0].problem, /front matter/);
  });

  it("answers an empty log when the folder does not exist yet", async () => {
    const log = await createDecisionsReader({ root: dir, folder: "nope", now: () => NOW })();
    assert.deepEqual(log.decisions, []);
    assert.deepEqual(log.problems, []);
  });
});

describe("the repo's own decision log", () => {
  it("parses every committed entry", async () => {
    // apps/console/src/server → repo root is four directories up.
    const root = new URL("../../../../", import.meta.url).pathname;
    const log = await createDecisionsReader({ root: process.platform === "win32" ? root.slice(1) : root })();
    assert.deepEqual(log.problems, []);
    assert.ok(log.decisions.length > 0, "docs/decisions/ should hold at least the entry that started the log");
  });
});
