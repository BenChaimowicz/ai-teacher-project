import assert from "node:assert/strict";
import { test } from "node:test";
import type { Generator, Judge, StructuredRequest } from "./model-ports.ts";
import { createDiagnosticBuilder, DiagnosticFailedError, type FactChecker } from "./diagnostic.ts";

const INPUT = { subject: "Microbiology", learningGoal: "Perform and interpret a Gram stain" };

/** A clean authored probe; `n` is its span and keeps every stem distinct. */
function probe(n: number, overrides: Record<string, unknown> = {}) {
  return {
    capability: `Capability ${n}`,
    span: n,
    kind: n <= 2 ? "application" : "knowledge",
    stem: `Which reagent fixes step ${n} in the procedure?`,
    options: [`Crystal violet ${n}`, `Safranin dye ${n}`, `Iodine mordant ${n}`],
    keyIndex: 2,
    warrant: `Warrant ${n}`,
    ...overrides,
  };
}

/** A clean rewrite of one item. */
function rewrite(capabilityId: string, n: number, overrides: Record<string, unknown> = {}) {
  const { capability: _capability, span: _span, ...item } = probe(n, { stem: `Rewritten: which reagent fixes step ${n}?`, ...overrides });
  return { capabilityId, ...item };
}

/** A Judge verdict that finds exactly the key defensible. */
function verdict(itemId: string, overrides: Record<string, unknown> = {}) {
  return { itemId, defensibleOptions: [2], flaws: [], performanceDemand: false, externalFactualClaim: false, ...overrides };
}

/** Scripted author: first call returns the set, later calls return queued rewrites. Records inputs. */
function scriptedGenerator(set: unknown, rewrites: unknown[] = [], modelId = "fixture/author") {
  const calls: { schemaName: string; input: unknown }[] = [];
  const generator: Generator = {
    modelId,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
      calls.push({ schemaName: request.schemaName, input: request.input });
      if (request.schemaName === "starting_level_diagnostic_items") return request.parse(set);
      const next = rewrites.shift();
      if (!next) throw new Error("No scripted rewrite left");
      return request.parse(next);
    },
  };
  return { generator, calls };
}

/** Scripted Judge: answers each reviewed item via `decide`, defaulting to a clean verdict. */
function scriptedJudge(decide: (itemId: string, stem: string) => Record<string, unknown> = () => ({}), modelId = "fixture/judge") {
  const calls: { input: unknown; authorModelId: string }[] = [];
  const judge: Judge = {
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelId: string }): Promise<T> {
      calls.push({ input: request.input, authorModelId: request.authorModelId });
      const { items } = request.input as { items: { itemId: string; stem: string; options: string[] }[] };
      return request.parse({ reviews: items.map((item) => verdict(item.itemId, decide(item.itemId, item.stem))) });
    },
  };
  return { judge, calls };
}

/** Fact-checker that confirms everything unless told otherwise. */
function scriptedFactChecker(confirm: (itemId: string) => boolean = () => true) {
  const calls: string[][] = [];
  const factChecker: FactChecker = {
    vendor: "fixture-search",
    async check(claims) {
      calls.push(claims.map((claim) => claim.itemId));
      return claims.map((claim) => ({ itemId: claim.itemId, confirmed: confirm(claim.itemId), reason: "checked", sourceUrls: ["https://example.org"] }));
    },
  };
  return { factChecker, calls };
}

const cleanSet = { coverageNote: "Written knowledge only; not wet-lab technique.", probes: Array.from({ length: 8 }, (_, i) => probe(i + 1)) };

test("A clean set yields eight ranked capabilities, eight items, and the models that made them", async () => {
  const { generator } = scriptedGenerator(cleanSet);
  const { judge, calls } = scriptedJudge();
  const { factChecker } = scriptedFactChecker();
  const draft = await createDiagnosticBuilder({ generator, judge, factChecker }).build(INPUT);
  assert.equal(draft.items.length, 8);
  assert.deepEqual(draft.capabilities.map((capability) => capability.span), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(draft.items.map((item) => item.capabilityId), draft.capabilities.map((capability) => capability.id));
  assert.deepEqual(draft.capabilities.map((capability) => capability.itemId), draft.items.map((item) => item.id));
  assert.equal(draft.coverageNote, cleanSet.coverageNote);
  assert.equal(draft.authorModelId, "fixture/author");
  assert.equal(draft.judgeModelId, "fixture/judge");
  assert.equal(draft.factCheckVendor, null, "No key was flagged, so no fact-check ran.");
  assert.equal(calls.length, 1, "All eight items are judged in one call.");
  assert.equal(calls[0]!.authorModelId, "fixture/author");
  assert.ok(!JSON.stringify(calls[0]!.input).includes("keyIndex") && !JSON.stringify(calls[0]!.input).includes("Warrant"),
    "The Judge never sees the key or warrant.");
});

test("A set without two application items, or with spans that are not 1 to 8, is invalid model output", async () => {
  for (const probes of [
    cleanSet.probes.map((p) => ({ ...p, kind: "knowledge" })),
    cleanSet.probes.map((p) => ({ ...p, span: 1 })),
    cleanSet.probes.slice(0, 7),
  ]) {
    const { generator } = scriptedGenerator({ ...cleanSet, probes });
    await assert.rejects(createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() }).build(INPUT));
  }
});

test("Items that break item-writing rules are rewritten and only the rewrites are judged again", async () => {
  const probes = [...cleanSet.probes];
  probes[2] = probe(3, { stem: "Which of these is NOT a Gram stain reagent?" });
  probes[5] = probe(6, { options: ["All of the above", "Safranin dye 6", "Iodine mordant 6"] });
  const { generator, calls: authorCalls } = scriptedGenerator({ ...cleanSet, probes }, [
    { items: [rewrite("cap3", 3), rewrite("cap6", 6)] },
  ]);
  const { judge, calls: judgeCalls } = scriptedJudge();
  const draft = await createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT);
  assert.equal(draft.items[2]!.stem, "Rewritten: which reagent fixes step 3?");
  assert.equal(draft.items[5]!.stem, "Rewritten: which reagent fixes step 6?");
  const rewriteInput = authorCalls[1]!.input as { rewrite: { capabilityId: string; problems: string[] }[] };
  assert.deepEqual(rewriteInput.rewrite.map((r) => r.capabilityId), ["cap3", "cap6"]);
  assert.ok(rewriteInput.rewrite.every((r) => r.problems.length > 0));
  assert.equal(judgeCalls.length, 2);
  const secondRound = (judgeCalls[1]!.input as { items: { itemId: string }[] }).items.map((item) => item.itemId);
  assert.deepEqual(secondRound, ["item3", "item6"]);
  assert.ok(draft.reviews.some((review) => review.itemId === "item3" && !review.passed && review.codeFailures.length > 0));
});

test("An item the Judge finds ambiguous, keyed wrong, or performance-based is rewritten", async () => {
  const { generator } = scriptedGenerator(cleanSet, [{ items: [rewrite("cap1", 1), rewrite("cap4", 4), rewrite("cap7", 7)] }]);
  const { judge } = scriptedJudge((itemId, stem) => stem.startsWith("Rewritten") ? {} : ({
    item1: { defensibleOptions: [1, 2] },
    item4: { defensibleOptions: [0] },
    item7: { performanceDemand: true },
  } as Record<string, Record<string, unknown>>)[itemId] ?? {});
  const draft = await createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT);
  assert.deepEqual(draft.items.filter((item) => item.stem.startsWith("Rewritten")).map((item) => item.id), ["item1", "item4", "item7"]);
});

test("Only keys the Judge flags as external facts are fact-checked, and an unconfirmed key is rewritten", async () => {
  const { generator } = scriptedGenerator(cleanSet, [{ items: [rewrite("cap5", 5)] }]);
  const { judge } = scriptedJudge((itemId, stem) => (itemId === "item2" || itemId === "item5") && !stem.startsWith("Rewritten")
    ? { externalFactualClaim: true } : {});
  const { factChecker, calls } = scriptedFactChecker((itemId) => itemId !== "item5");
  const draft = await createDiagnosticBuilder({ generator, judge, factChecker }).build(INPUT);
  assert.deepEqual(calls, [["item2", "item5"]]);
  assert.equal(draft.items[4]!.stem, "Rewritten: which reagent fixes step 5?");
  assert.equal(draft.factCheckVendor, "fixture-search");
});

test("Items still failing after two rewrite rounds fail the diagnostic", async () => {
  const { generator, calls } = scriptedGenerator(cleanSet, [{ items: [rewrite("cap8", 8)] }, { items: [rewrite("cap8", 8)] }]);
  const { judge } = scriptedJudge((itemId) => itemId === "item8" ? { defensibleOptions: [] } : {});
  await assert.rejects(
    createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT),
    (error) => error instanceof DiagnosticFailedError && error.failedItemIds.includes("item8") &&
      error.problems.item8?.[0] === "The reviewer found no defensible answer.",
  );
  assert.equal(calls.length, 3, "One authoring call and two rewrite rounds.");
});

test("The author cannot judge its own items", async () => {
  const { generator } = scriptedGenerator(cleanSet, [], "same/model");
  const { judge } = scriptedJudge(() => ({}), "same/model");
  await assert.rejects(createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT));
});

test("The remaining-gap statement never claims the Learning Goal is already met", async () => {
  const statements = ["You already meet this goal.", "Start with how mordants fix crystal violet, then decolorization."];
  const generator: Generator = {
    modelId: "fixture/author",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
      return request.parse({ remainingGapStatement: statements.shift() });
    },
  };
  const builder = createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() });
  const statement = await builder.writeGapStatement({ ...INPUT, extremity: "ceiling", capabilities: [] });
  assert.equal(statement, "Start with how mordants fix crystal violet, then decolorization.");
});

test("Items are written and rewritten with low reasoning effort", async () => {
  const efforts: Record<string, unknown> = {};
  const { generator } = scriptedGenerator(cleanSet);
  const recording: typeof generator = {
    modelId: generator.modelId,
    generateStructured(request) {
      efforts[request.schemaName] = request.reasoningEffort;
      return generator.generateStructured(request);
    },
  };
  const judged = scriptedJudge((itemId, stem) => itemId === "item1" && !stem.startsWith("Rewritten") ? { defensibleOptions: [] } : {});
  generator.generateStructured = scriptedGenerator(cleanSet, [{ items: [rewrite("cap1", 1)] }]).generator.generateStructured;
  await createDiagnosticBuilder({ generator: recording, ...judged, ...scriptedFactChecker() }).build(INPUT);
  assert.equal(efforts.starting_level_diagnostic_items, "low");
  assert.equal(efforts.starting_level_diagnostic_rewrites, "low");
});
