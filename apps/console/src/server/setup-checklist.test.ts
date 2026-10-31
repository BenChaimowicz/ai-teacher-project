import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { SETUP_CHECKLIST, buildSetupChecklist, createSetupChecklistService, isSetupChecklistItem } from "./setup-checklist.ts";

const AT = "2026-10-31T09:00:00.000Z";

describe("Setup checklist content", () => {
  it("has the ten sections in order", () => {
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
        "Run a recovery drill",
      ],
    );
  });

  it("has every item from the founders' list", () => {
    assert.deepEqual(SETUP_CHECKLIST.map((section) => section.items.length), [5, 9, 5, 5, 7, 6, 8, 6, 10, 8]);
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
    assert.equal(checklist.total, 69);
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
  /**
   * A runner that records each statement and answers the read with the given rows.
   * @param rows - Rows the read returns
   */
  function fakeRunner(rows: Record<string, unknown>[] = []) {
    const statements: { text: string; params: unknown[] }[] = [];
    const dialect = new PgDialect();
    const run = async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      statements.push({ text, params });
      return text.trimStart().startsWith("select") ? rows : [];
    };
    return { run, statements };
  }

  it("ticks as the operator, keeping whoever ticked first", async () => {
    const { run, statements } = fakeRunner([{ itemKey: "vault.create", completedAt: new Date(AT), completedBy: "Ben" }]);
    const checklist = await createSetupChecklistService(run, "Ben").setDone("vault.create", true);
    assert.match(statements[0].text, /on conflict \(item_key\) do update/);
    assert.match(statements[0].text, /coalesce\(setup_checklist_progress\.completed_at/);
    assert.deepEqual(statements[0].params, ["vault.create", "Ben"]);
    assert.equal(checklist.sections[0].items[0].completedAt, AT);
  });

  it("unticks by clearing who and when, not by deleting", async () => {
    const { run, statements } = fakeRunner();
    await createSetupChecklistService(run, "Ben").setDone("vault.create", false);
    assert.match(statements[0].text, /^update setup_checklist_progress set completed_at = null, completed_by = null/);
    assert.deepEqual(statements[0].params, ["vault.create"]);
  });

  it("names the item when saving fails", async () => {
    const run = async () => {
      throw new Error("connection reset");
    };
    await assert.rejects(createSetupChecklistService(run, "Ben").setDone("vault.create", true), /itemKey=vault\.create/);
  });
});
