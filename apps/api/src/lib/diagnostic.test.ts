import assert from "node:assert/strict";
import { test } from "node:test";
import { createModelPorts, type Generator, type Judge, type StructuredRequest, type ModelReply } from "./model-ports.ts";
import { loadModelConfig } from "./model-config.ts";
import { createDiagnosticBuilder, DiagnosticFailedError, type FactChecker } from "./diagnostic.ts";
import { ModelError, type StructuredTransport } from "./openrouter.ts";

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
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      calls.push({ schemaName: request.schemaName, input: request.input });
      if (request.schemaName === "starting_level_diagnostic_items") return { value: request.parse(set), modelId: modelId };
      const next = rewrites.shift();
      if (!next) throw new Error("No scripted rewrite left");
      return { value: request.parse(next), modelId: modelId };
    },
  };
  return { generator, calls };
}

/** Scripted Judge: answers each reviewed item via `decide`, defaulting to a clean verdict. */
function scriptedJudge(decide: (itemId: string, stem: string) => Record<string, unknown> = () => ({}), modelId = "fixture/judge") {
  const calls: { input: unknown; authorModelIds: readonly string[] }[] = [];
  const judge: Judge = {
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      calls.push({ input: request.input, authorModelIds: request.authorModelIds });
      const { items } = request.input as { items: { itemId: string; stem: string; options: string[] }[] };
      return { value: request.parse({ reviews: items.map((item) => verdict(item.itemId, decide(item.itemId, item.stem))) }), modelId: modelId };
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
  assert.deepEqual(calls[0]!.authorModelIds, ["fixture/author"]);
  assert.ok(!JSON.stringify(calls[0]!.input).includes("keyIndex") && !JSON.stringify(calls[0]!.input).includes("Warrant"),
    "The Judge never sees the key or warrant.");
});

test("A set short of application items rewrites its nearest-goal knowledge items as application items", async () => {
  const probes = cleanSet.probes.map((p) => ({ ...p, kind: "knowledge" }));
  const { generator, calls: authorCalls } = scriptedGenerator({ ...cleanSet, probes }, [
    { items: [rewrite("cap8", 8, { kind: "application" }), rewrite("cap7", 7, { kind: "application" })] },
  ]);
  const { judge, calls: judgeCalls } = scriptedJudge();
  const draft = await createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT);

  const rewriteInput = authorCalls[1]!.input as { rewrite: { capabilityId: string; kind: string; problems: string[] }[] };
  assert.deepEqual(rewriteInput.rewrite.map((r) => [r.capabilityId, r.kind]), [["cap7", "application"], ["cap8", "application"]]);
  assert.ok(rewriteInput.rewrite.every((r) => r.problems.some((problem) => problem.includes("application items"))));
  assert.deepEqual((judgeCalls[0]!.input as { items: { itemId: string }[] }).items.map((item) => item.itemId),
    ["item1", "item2", "item3", "item4", "item5", "item6"], "Items about to be rewritten are not judged first.");
  assert.equal(draft.items.filter((item) => item.kind === "application").length, 2);
});

test("Repeated spans are ties in the author's order, renumbered 1 to 8", async () => {
  const probes = cleanSet.probes.map((p, index) => ({ ...p, span: index < 4 ? 1 : 2 }));
  const { generator } = scriptedGenerator({ ...cleanSet, probes });
  const draft = await createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() }).build(INPUT);
  assert.deepEqual(draft.capabilities.map((capability) => [capability.statement, capability.span]),
    cleanSet.probes.map((p, index) => [p.capability, index + 1]));
});

test("A set that is not eight items is invalid model output", async () => {
  const { generator } = scriptedGenerator({ ...cleanSet, probes: cleanSet.probes.slice(0, 7) });
  await assert.rejects(createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() }).build(INPUT),
    (error: unknown) => error instanceof ModelError && error.code === "invalid_output");
});

test("A rewrite that leaves out or adds a capability keeps the old item for the next round, not invalid output", async () => {
  const probes = [...cleanSet.probes];
  probes[2] = probe(3, { stem: "Which of these is NOT a Gram stain reagent?" });
  probes[5] = probe(6, { options: ["All of the above", "Safranin dye 6", "Iodine mordant 6"] });
  const { generator } = scriptedGenerator({ ...cleanSet, probes }, [
    { items: [rewrite("cap3", 3), rewrite("cap1", 1, { stem: "Unrequested rewrite." })] },
    { items: [rewrite("cap6", 6)] },
  ]);
  const draft = await createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() }).build(INPUT);
  assert.equal(draft.items[0]!.stem, cleanSet.probes[0]!.stem, "An unrequested rewrite is ignored.");
  assert.equal(draft.items[2]!.stem, "Rewritten: which reagent fixes step 3?");
  assert.equal(draft.items[5]!.stem, "Rewritten: which reagent fixes step 6?", "The left-out item is rewritten next round.");
});

test("A rewrite written by the fallback model is judged by a model that wrote no item, and both authors are recorded", async () => {
  const probes = [...cleanSet.probes];
  probes[2] = probe(3, { stem: "Which of these is NOT a Gram stain reagent?" });
  const { generator } = scriptedGenerator({ ...cleanSet, probes }, [{ items: [rewrite("cap3", 3)] }]);
  const authored = generator.generateStructured.bind(generator);
  generator.generateStructured = async (request) => {
    const reply = await authored(request);
    return request.schemaName === "starting_level_diagnostic_rewrites" ? { ...reply, modelId: "fixture/fallback" } : reply;
  };
  const { judge, calls } = scriptedJudge();
  const draft = await createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT);
  assert.deepEqual(calls[1]!.authorModelIds, ["fixture/author", "fixture/fallback"]);
  assert.equal(draft.authorModelId, "fixture/author, fixture/fallback");
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
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      return { value: request.parse({ remainingGapStatement: statements.shift() }), modelId: "fixture/author" };
    },
  };
  const builder = createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() });
  const statement = await builder.writeGapStatement({ ...INPUT, extremity: "ceiling", capabilities: [] });
  assert.equal(statement, "Start with how mordants fix crystal violet, then decolorization.");
});

test("Writing and rewriting items cap hidden reasoning tokens", async () => {
  const budgets: Record<string, unknown> = {};
  const { generator } = scriptedGenerator(cleanSet, [{ items: [rewrite("cap1", 1)] }]);
  const recording: Generator = {
    modelId: generator.modelId,
    generateStructured(request) {
      budgets[request.schemaName] = request.reasoningMaxTokens;
      return generator.generateStructured(request);
    },
  };
  const { judge } = scriptedJudge((itemId, stem) => itemId === "item1" && !stem.startsWith("Rewritten") ? { defensibleOptions: [] } : {});
  await createDiagnosticBuilder({ generator: recording, judge, ...scriptedFactChecker() }).build(INPUT);
  for (const schemaName of ["starting_level_diagnostic_items", "starting_level_diagnostic_rewrites"]) {
    const budget = budgets[schemaName];
    assert.ok(typeof budget === "number" && budget > 0 && budget <= 2000, `${schemaName} reasoning budget: ${budget}`);
  }
});

test("Options may differ in length; only a key that stands out as clearly longest is rejected", async () => {
  const probes = [...cleanSet.probes];
  probes[0] = probe(1, { options: ["Heat", "A longer but plausible distractor about cell walls", "Iodine"] });
  probes[1] = probe(2, { options: ["Heat", "Water", "Iodine, which binds crystal violet into a large complex inside the cell"] });
  const { generator, calls } = scriptedGenerator({ ...cleanSet, probes }, [{ items: [rewrite("cap2", 2)] }]);
  await createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() }).build(INPUT);
  const rewritten = (calls[1]!.input as { rewrite: { capabilityId: string }[] }).rewrite.map((r) => r.capabilityId);
  assert.deepEqual(rewritten, ["cap2"]);
});

test("Completion stems, contrastive 'not', and 'only' are accepted; a NOT/EXCEPT stem and absolutes are rewritten", async () => {
  const probes = [...cleanSet.probes];
  probes[0] = probe(1, { stem: "Under the microscope, bacilli are bacteria shaped as", options: ["spheres", "spirals", "rods"] });
  probes[1] = probe(2, { stem: "Why does decolorizer clear Gram-negative but not Gram-positive cells, at least briefly?" });
  probes[2] = probe(3, { options: ["Crystal violet 3", "Only safranin 3", "Iodine mordant 3"] });
  probes[3] = probe(4, { stem: "Which reagent is NOT used in step 4?" });
  probes[4] = probe(5, { stem: "Every reagent is applied in step 5 except which one?" });
  probes[5] = probe(6, { options: ["Crystal violet 6", "Safranin always 6", "Iodine mordant 6"] });
  const { generator, calls } = scriptedGenerator({ ...cleanSet, probes }, [{ items: [rewrite("cap4", 4), rewrite("cap5", 5), rewrite("cap6", 6)] }]);
  await createDiagnosticBuilder({ generator, ...scriptedJudge(), ...scriptedFactChecker() }).build(INPUT);
  const rewritten = (calls[1]!.input as { rewrite: { capabilityId: string }[] }).rewrite.map((r) => r.capabilityId);
  assert.deepEqual(rewritten, ["cap4", "cap5", "cap6"]);
});

test("Re-reviewed items are judged alongside the kept items so duplicates can be caught", async () => {
  const { generator } = scriptedGenerator(cleanSet, [{ items: [rewrite("cap2", 2)] }]);
  const { judge, calls } = scriptedJudge((itemId, stem) => itemId === "item2" && !stem.startsWith("Rewritten") ? { flaws: ["Duplicates item 1."] } : {});
  await createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT);
  const second = calls[1]!.input as { items: { itemId: string }[]; otherItems: { stem: string }[] };
  assert.deepEqual(second.items.map((item) => item.itemId), ["item2"]);
  assert.equal(second.otherItems.length, 7);
  assert.ok(!JSON.stringify(second.otherItems).includes("keyIndex"));
});

/** The clean set as a different author would write it, with stems the scripted Judge can tell apart. */
const fallbackSet = { ...cleanSet, probes: cleanSet.probes.map((value, i) => ({ ...value, stem: `Fallback: which dye marks step ${i + 1} here?` })) };

/** A Judge that finds no defensible answer to the primary author's item 8, in every round. */
function failsPrimaryItem8() {
  return scriptedJudge((itemId, stem) => itemId === "item8" && !stem.startsWith("Fallback") ? { defensibleOptions: [] } : {});
}

test("A set still failing after its rewrite rounds is written again once by the fallback Generator", async () => {
  const primary = scriptedGenerator(cleanSet, [{ items: [rewrite("cap8", 8)] }, { items: [rewrite("cap8", 8)] }]);
  const fallback = scriptedGenerator(fallbackSet, [], "fixture/fallback");
  const { judge, calls } = failsPrimaryItem8();
  const draft = await createDiagnosticBuilder({ generator: primary.generator, fallbackGenerator: fallback.generator, judge, ...scriptedFactChecker() }).build(INPUT);
  assert.equal(primary.calls.length, 3, "The primary author used its full rewrite budget first.");
  assert.equal(fallback.calls.length, 1);
  assert.equal(draft.authorModelId, "fixture/fallback");
  assert.ok(draft.items.every((item) => item.stem.startsWith("Fallback")));
  assert.deepEqual(calls.at(-1)!.authorModelIds, ["fixture/fallback"], "The Judge is told who wrote the set it reviews.");
});

test("When the fallback Generator's set fails too, the diagnostic fails", async () => {
  const primary = scriptedGenerator(cleanSet, [{ items: [rewrite("cap8", 8)] }, { items: [rewrite("cap8", 8)] }]);
  const fallback = scriptedGenerator(cleanSet, [{ items: [rewrite("cap8", 8)] }, { items: [rewrite("cap8", 8)] }], "fixture/fallback");
  const { judge } = failsPrimaryItem8();
  await assert.rejects(
    createDiagnosticBuilder({ generator: primary.generator, fallbackGenerator: fallback.generator, judge, ...scriptedFactChecker() }).build(INPUT),
    DiagnosticFailedError,
  );
  assert.deepEqual([primary.calls.length, fallback.calls.length], [3, 3]);
});

test("A provider error does not switch to the fallback Generator", async () => {
  const generator: Generator = { modelId: "fixture/author", async generateStructured<T>(): Promise<ModelReply<T>> { throw new ModelError("network"); } };
  const fallback = scriptedGenerator(cleanSet, [], "fixture/fallback");
  await assert.rejects(createDiagnosticBuilder({ generator, fallbackGenerator: fallback.generator, ...scriptedJudge(), ...scriptedFactChecker() }).build(INPUT), ModelError);
  assert.equal(fallback.calls.length, 0);
});

test("A malformed set or Judge reply is asked once more by the ports; a set malformed on every model is an error", async () => {
  const config = loadModelConfig({});
  let authored = 0;
  let judged = 0;
  const transport: StructuredTransport = {
    async complete<T>(_modelId: string, request: StructuredRequest<T>): Promise<T> {
      if (request.schemaName === "starting_level_diagnostic_items") return request.parse(++authored === 1 ? { probes: "eight" } : cleanSet);
      const { items } = request.input as { items: { itemId: string }[] };
      return request.parse(++judged === 1 ? { reviews: "none" } : { reviews: items.map((item) => verdict(item.itemId)) });
    },
  };
  const { generator, judge } = createModelPorts({ config, transport, log: { warn() {} } });
  const draft = await createDiagnosticBuilder({ generator, judge, ...scriptedFactChecker() }).build(INPUT);
  assert.equal(draft.items.length, 8);
  assert.deepEqual([authored, judged], [2, 2]);

  let garbageCalls = 0;
  const garbage: StructuredTransport = { async complete<T>(_modelId: string, request: StructuredRequest<T>): Promise<T> { garbageCalls++; return request.parse({}); } };
  const ports = createModelPorts({ config, transport: garbage, log: { warn() {} } });
  await assert.rejects(createDiagnosticBuilder({ generator: ports.generator, judge: ports.judge, ...scriptedFactChecker() }).build(INPUT),
    (error) => error instanceof ModelError && error.code === "invalid_output");
  assert.equal(garbageCalls, 3, "The primary twice, then the fallback once (ADR 0015).");
});
