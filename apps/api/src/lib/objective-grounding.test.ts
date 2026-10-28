import assert from "node:assert/strict";
import { test } from "node:test";
import type { GoalScope } from "@senoy/db/course-request";
import { ModelError } from "./openrouter.ts";
import type { Judge, ModelReply, StructuredRequest } from "./model-ports.ts";
import { allSupported, groundObjectives, taughtObjectives, type GroundingMaterial } from "./objective-grounding.ts";

const SLOT = { title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds." };
const SOURCES: GroundingMaterial = { sources: [{ sourceId: "src_aaaaaaaaaa", excerpts: ["Yggdrasil is the world tree."] }] };

/** Scripted grounding judge: returns `reply`, and records what it was shown. */
function scriptedJudge(reply: unknown) {
  const calls: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const judge: Judge = {
    modelId: "fixture/judge",
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      calls.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
      return { value: request.parse(reply), modelId: "fixture/judge" };
    },
  };
  return { judge, calls };
}

/** Grounds `objectives` against one reply. */
function ground(objectives: string[], reply: unknown, material: GroundingMaterial = SOURCES, scope: GoalScope | null = null) {
  const { judge, calls } = scriptedJudge(reply);
  const grounded = groundObjectives({
    judge, authorModelIds: ["fixture/author"], objectives, slot: SLOT,
    learningGoal: "Explain the Norse picture of the world", scope, material,
  });
  return { grounded, calls };
}

/** One objective's verdict, as the grounding call returns it. */
function verdict(objective: string, verdict: string, text = "", reason = "") {
  return { objective, verdict, text, reason };
}

test("Each objective comes back with its verdict, in Blueprint order, and a supported one keeps the Blueprint's wording", async () => {
  const { grounded, calls } = ground(["Describe Yggdrasil", "Name its three roots", "Say where it grew"], {
    objectives: [
      // Out of order, and with a "text" the call did not ask for: the Blueprint's wording is what a supported objective teaches.
      verdict("Say where it grew", "unsupported", "", "No excerpt places the tree."),
      verdict("Describe Yggdrasil", "supported", "Describe the tree in my own words"),
      verdict("Name its three roots", "rewritten", "  Name its roots  ", "The excerpts do not give a number of roots."),
    ],
  });

  assert.deepEqual(await grounded, [
    { objective: "Describe Yggdrasil", verdict: "supported", text: "Describe Yggdrasil", reason: "" },
    { objective: "Name its three roots", verdict: "rewritten", text: "Name its roots", reason: "The excerpts do not give a number of roots." },
    { objective: "Say where it grew", verdict: "unsupported", text: "", reason: "No excerpt places the tree." },
  ]);
  assert.deepEqual(taughtObjectives(await grounded), ["Describe Yggdrasil", "Name its roots"], "What the Lesson teaches, in Blueprint order.");
  assert.equal(calls.length, 1, "Grounding is one call for the whole slot.");
});

test("Grounding asks about each objective once and tells the Judge nothing but the slot and its material", async () => {
  const { grounded, calls } = ground(["Describe Yggdrasil", "Describe Yggdrasil", "Name its roots"], {
    objectives: [verdict("Describe Yggdrasil", "unsupported", "", "Nothing covers it."), verdict("Name its roots", "supported")],
  });
  const result = await grounded;

  const input = calls[0]!.input as { slot: { objectives: string[]; title: string }; sources: unknown[]; scope?: unknown };
  assert.deepEqual(input.slot.objectives, ["Describe Yggdrasil", "Name its roots"], "An objective two slots word the same way is asked once.");
  assert.deepEqual(input.sources, SOURCES.sources, "The material is exactly what the author will be shown.");
  assert.equal(input.scope, undefined, "Scope is left out entirely when there is none.");
  assert.deepEqual(result.map(({ objective, verdict: given }) => [objective, given]), [
    ["Describe Yggdrasil", "unsupported"], ["Describe Yggdrasil", "unsupported"], ["Name its roots", "supported"],
  ], "One verdict covers every copy of an objective.");
  assert.deepEqual(taughtObjectives(result), ["Name its roots"]);

  const schema = calls[0]!.schema as { properties: { objectives: { minItems: number; maxItems: number; items: { properties: { objective: { enum: string[] } } } } } };
  assert.deepEqual(schema.properties.objectives.items.properties.objective.enum, ["Describe Yggdrasil", "Name its roots"]);
  assert.deepEqual([schema.properties.objectives.minItems, schema.properties.objectives.maxItems], [2, 2], "One verdict per distinct objective, no more and no fewer.");
  assert.deepEqual(calls[0]!.authorModelIds, ["fixture/author"], "The model that will write the Lesson does not ground its objectives (ADR 0015).");
  assert.doesNotMatch(calls[0]!.systemPrompt, /norse|yggdrasil/i, "Prompts stay subject-neutral (ADR 0011).");
});

test("A Quiz's objectives are grounded against the Lessons it assesses", async () => {
  const lessons = [{ title: "The World Tree", sections: [{ heading: "The tree", paragraphs: ["Yggdrasil is the world tree."] }] }];
  const { grounded, calls } = ground(["Name its roots"], { objectives: [verdict("Name its roots", "unsupported", "", "The Lesson does not name a root.")] }, { lessons });

  assert.deepEqual(taughtObjectives(await grounded), []);
  assert.deepEqual((calls[0]!.input as { lessons: unknown[] }).lessons, lessons);
});

test("With a scope, grounding is told it judges support and not scope", async () => {
  const scope: GoalScope = { inScope: ["the world tree"], outOfScope: ["Ragnarök"] };
  const { grounded, calls } = ground(["Describe Yggdrasil"], { objectives: [verdict("Describe Yggdrasil", "supported")] }, SOURCES, scope);
  await grounded;

  assert.deepEqual((calls[0]!.input as { scope: GoalScope }).scope, scope);
  assert.match(calls[0]!.systemPrompt, /Grounding does not judge scope/);
});

test("A verdict that cannot be applied is invalid output, so the call is retried rather than guessed at", async () => {
  const bad: [string, unknown][] = [
    ["not an object", []],
    ["an unknown objective", { objectives: [verdict("Name its roots", "supported")] }],
    ["a missing objective", { objectives: [] }],
    ["a repeated objective", { objectives: [verdict("Describe Yggdrasil", "supported"), verdict("Describe Yggdrasil", "unsupported", "", "Why.")] }],
    ["an unknown verdict", { objectives: [verdict("Describe Yggdrasil", "partly")] }],
    ["a rewrite with nothing to teach", { objectives: [verdict("Describe Yggdrasil", "rewritten", "   ", "Why.")] }],
  ];
  for (const [what, reply] of bad) {
    await assert.rejects(ground(["Describe Yggdrasil"], reply).grounded,
      (error: unknown) => error instanceof ModelError && error.code === "invalid_output", `Grounding accepted ${what}.`);
  }
});

test("A slot with no objectives is not grounded at all", async () => {
  const { grounded, calls } = ground([], { objectives: [] });
  assert.deepEqual(await grounded, []);
  assert.equal(calls.length, 0, "No objectives, no spend.");
});

test("allSupported grounds every objective as the Blueprint wrote it", () => {
  assert.deepEqual(allSupported(["Describe Yggdrasil"]), [{ objective: "Describe Yggdrasil", verdict: "supported", text: "Describe Yggdrasil", reason: "" }]);
  assert.deepEqual(taughtObjectives(allSupported(["A", "B"])), ["A", "B"]);
});
