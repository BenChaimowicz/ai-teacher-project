import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  SETUP_CHECKLIST,
  SETUP_CHECKLIST_PROGRESS_FILE,
  buildSetupChecklist,
  createSetupChecklistService,
  formatSetupChecklistProgress,
  isSetupChecklistItem,
  parseSetupChecklistProgress,
} from "./setup-checklist.ts";

const AT = "2026-10-31T09:00:00.000Z";

describe("Setup checklist content", () => {
  it("has the nine sections in order", () => {
    assert.deepEqual(
      SETUP_CHECKLIST.map((section) => section.title),
      [
        "Create the shared password vault",
        "Secure the domain",
        "Set up founder email",
        "Create shared role addresses",
        "Configure and test DNS email records",
        "Test normal email",
        "Set up vendor access",
        "Configure application email",
        "Connect Supabase Auth",
      ],
    );
  });

  it("has every item from the founders' list", () => {
    assert.deepEqual(SETUP_CHECKLIST.map((section) => section.items.length), [5, 9, 5, 5, 7, 6, 8, 6, 10]);
  });

  it("keys every item uniquely, under its section's key", () => {
    const keys = SETUP_CHECKLIST.flatMap((section) => section.items.map(([key]) => key));
    assert.equal(new Set(keys).size, keys.length);
    for (const section of SETUP_CHECKLIST) {
      for (const [key] of section.items) assert.ok(key.startsWith(`${section.key}.`), key);
    }
  });

  it("knows its own items and nothing else", () => {
    assert.equal(isSetupChecklistItem("domain.auto-renew"), true);
    assert.equal(isSetupChecklistItem("domain.password"), false);
  });
});

describe("buildSetupChecklist", () => {
  it("starts with everything open", () => {
    const checklist = buildSetupChecklist([], null);
    assert.equal(checklist.done, 0);
    assert.equal(checklist.total, 61);
    assert.ok(checklist.sections.every((section) => section.done === 0 && section.total === section.items.length));
  });

  it("counts ticked items per section and overall, and shows who ticked them", () => {
    const checklist = buildSetupChecklist(
      [
        { itemKey: "vault.create", completedAt: AT, completedBy: "Ben" },
        { itemKey: "vault.2fa", completedAt: AT, completedBy: "Yarden" },
        { itemKey: "domain.lock", completedAt: null, completedBy: null },
      ],
      "Ben",
    );
    const vault = checklist.sections[0];
    assert.equal(vault.done, 2);
    assert.equal(checklist.sections[1].done, 0);
    assert.equal(checklist.done, 2);
    assert.deepEqual(vault.items[0], { key: "vault.create", label: vault.items[0].label, completedAt: AT, completedBy: "Ben" });
    assert.equal(checklist.operator, "Ben");
  });

  it("ignores rows for items no longer in the list, so nothing is duplicated or miscounted", () => {
    const checklist = buildSetupChecklist([{ itemKey: "retired.item", completedAt: AT, completedBy: "Ben" }], null);
    assert.equal(checklist.done, 0);
    assert.equal(checklist.sections.flatMap((section) => section.items).length, checklist.total);
  });
});

describe("createSetupChecklistService", () => {
  /** A fresh checkout with no progress file yet. */
  async function checkout() {
    const root = await mkdtemp(join(tmpdir(), "setup-checklist-"));
    const file = join(root, SETUP_CHECKLIST_PROGRESS_FILE);
    return { root, readProgress: async () => readFile(file, "utf8"), writeProgress: async (text: string) => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, text);
    } };
  }

  it("starts with everything open when there is no progress file", async () => {
    const { root } = await checkout();
    const checklist = await createSetupChecklistService({ root, operator: "Ben" }).read();
    assert.equal(checklist.done, 0);
    assert.equal(checklist.operator, "Ben");
  });

  it("writes a tick to the file as the operator, keeping whoever ticked first", async () => {
    const { root, readProgress, writeProgress } = await checkout();
    await writeProgress(`{\n  "vault.create": {"completedAt":"${AT}","completedBy":"Yarden"}\n}\n`);
    const service = createSetupChecklistService({ root, operator: "Ben", now: () => new Date("2026-11-01T08:00:00.000Z") });
    await service.setDone("vault.create", true);
    const checklist = await service.setDone("domain.lock", true);
    assert.equal(
      await readProgress(),
      `{\n  "vault.create": {"completedAt":"${AT}","completedBy":"Yarden"},\n` +
        `  "domain.lock": {"completedAt":"2026-11-01T08:00:00.000Z","completedBy":"Ben"}\n}\n`,
    );
    assert.equal(checklist.done, 2);
  });

  it("unticks by removing the entry", async () => {
    const { root, readProgress } = await checkout();
    const service = createSetupChecklistService({ root, operator: "Ben" });
    await service.setDone("vault.create", true);
    const checklist = await service.setDone("vault.create", false);
    assert.equal(await readProgress(), "{}\n");
    assert.equal(checklist.done, 0);
  });

  it("loses no tick when two are saved at once", async () => {
    const { root } = await checkout();
    const service = createSetupChecklistService({ root, operator: "Ben" });
    await Promise.all([service.setDone("vault.create", true), service.setDone("vault.2fa", true)]);
    assert.equal((await service.read()).done, 2);
  });

  it("names the file when it cannot be parsed, e.g. after a merge conflict", async () => {
    const { root, writeProgress } = await checkout();
    await writeProgress("<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> main\n");
    await assert.rejects(createSetupChecklistService({ root, operator: "Ben" }).read(), /file=docs\/setup-checklist-progress\.json/);
  });
});

describe("formatSetupChecklistProgress", () => {
  it("round-trips, in checklist order, keeping keys no longer on the list", () => {
    const text = '{\n  "retired.item": {"completedAt":"' + AT + '","completedBy":null},\n  "domain.lock": {"completedAt":"' + AT + '","completedBy":"Ben"}\n}\n';
    const formatted = formatSetupChecklistProgress(parseSetupChecklistProgress(text));
    assert.ok(formatted.indexOf("domain.lock") < formatted.indexOf("retired.item"));
    assert.deepEqual(parseSetupChecklistProgress(formatted), parseSetupChecklistProgress(text));
  });
});
