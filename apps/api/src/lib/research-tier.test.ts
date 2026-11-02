import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResearchTierMode } from "@senoy/research";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts, type StructuredRequest } from "./model-ports.ts";
import { ModelError, type StructuredTransport } from "./openrouter.ts";
import {
  createResearchTierRater,
  parseResearchTierRating,
  RESEARCH_TIER_SYSTEM_PROMPT,
  tierFor,
  type ResearchTierInput,
} from "./research-tier.ts";

const INPUT: ResearchTierInput = {
  subject: "Norse mythology",
  learningGoal: "Retell how the Nine Worlds hang on Yggdrasil",
  scope: { inScope: ["Cosmology"], outOfScope: ["Later retellings"] },
};

const config = loadModelConfig({});

/**
 * A transport that answers every call with `reply` (or throws it) and records what it was asked.
 * @param reply - The raw model output, or an error to throw
 */
function scripted(reply: unknown) {
  const asked: { modelId: string; request: StructuredRequest<unknown> }[] = [];
  const transport: StructuredTransport = {
    async complete<T>(modelId: string, request: StructuredRequest<T>): Promise<T> {
      asked.push({ modelId, request: request as StructuredRequest<unknown> });
      if (reply instanceof Error) throw reply;
      return request.parse(reply);
    },
  };
  return { triage: createModelPorts({ config, transport, log: { warn() {} } }).triage, asked };
}

/**
 * Rates `INPUT` with a scripted reply under one `RESEARCH_TIER` mode.
 * @param reply - Raw model output, or an error
 * @param mode - `RESEARCH_TIER`
 */
async function rate(reply: unknown, mode: ResearchTierMode = "auto") {
  const { triage, asked } = scripted(reply);
  const warnings: string[] = [];
  const choice = await createResearchTierRater({ triage, mode, log: { warn: (message) => warnings.push(message) } }).choose(INPUT);
  return { choice, asked, warnings };
}

/** Rubric answers with every question false, then overridden. */
const answers = (overrides: Partial<Record<"niche" | "scholarly" | "dense", boolean>> = {}) => ({
  niche: false, scholarly: false, dense: false, reason: "A widely taught topic.", ...overrides,
});

test("Niche or scholarly is deluxe under auto; the rating is stored with the triage model's id", async () => {
  for (const flags of [{ niche: true }, { scholarly: true }, { niche: true, scholarly: true, dense: true }]) {
    const { choice } = await rate(answers(flags));
    assert.equal(choice.tier, "deluxe", JSON.stringify(flags));
    assert.deepEqual(choice.rating, { ...answers(flags), modelId: config.triageModel });
    assert.equal(choice.error, null);
  }
});

test("Density alone stays regular, and so does a mainstream topic, under auto", async () => {
  assert.equal((await rate(answers({ dense: true }))).choice.tier, "regular");
  assert.equal((await rate(answers())).choice.tier, "regular");
});

test("A failed rating is deluxe under auto, with no rating, and is logged rather than thrown", async () => {
  const { choice, asked, warnings } = await rate({ niche: "yes", scholarly: false, dense: false, reason: "x" });
  assert.deepEqual([choice.tier, choice.rating], ["deluxe", null]);
  assert.match(choice.error ?? "", /invalid/i);
  assert.equal(asked.length, 2, "One bad reply is retried on the triage model, with no fallback.");
  assert.ok(asked.every((call) => call.modelId === config.triageModel));
  assert.match(warnings[0]!, /^\[research-tier: choose\] Research tier rating failed \|\| mode=auto/);

  const down = await rate(new ModelError("network"));
  assert.deepEqual([down.choice.tier, down.choice.rating], ["deluxe", null]);
});

test("Forced modes pick their tier, but the rating is still taken and kept for the Usage Console", async () => {
  const forcedRegular = await rate(answers({ niche: true }), "regular");
  assert.equal(forcedRegular.choice.tier, "regular");
  assert.equal(forcedRegular.choice.rating?.niche, true, "The console still shows that auto would have picked deluxe.");
  assert.equal(forcedRegular.asked.length, 1);

  const forcedDeluxe = await rate(answers({ dense: true }), "deluxe");
  assert.equal(forcedDeluxe.choice.tier, "deluxe");
  assert.equal(forcedDeluxe.choice.rating?.dense, true);
  assert.equal(forcedDeluxe.choice.mode, "deluxe");
});

test("The tier rule: forced modes win, auto applies the rating, and auto with no rating is deluxe", () => {
  const mainstream = { niche: false, scholarly: false };
  assert.equal(tierFor("deluxe", mainstream), "deluxe");
  assert.equal(tierFor("regular", { niche: true, scholarly: true }), "regular");
  assert.equal(tierFor("auto", mainstream), "regular");
  assert.equal(tierFor("auto", { niche: false, scholarly: true }), "deluxe");
  assert.equal(tierFor("auto", null), "deluxe");
});

test("The goal, scope and subject go only into the user message, under an untrusted-content guard", async () => {
  const { asked } = await rate(answers());
  const request = asked[0]!.request;
  assert.deepEqual(request.input, INPUT);
  assert.equal(request.schemaName, "research_tier_rating");
  assert.equal(request.systemPrompt, RESEARCH_TIER_SYSTEM_PROMPT);
  assert.doesNotMatch(request.systemPrompt, /Norse/);
  assert.match(request.systemPrompt, /untrusted learner content/);
  assert.match(request.systemPrompt, /Do not search, call tools/);
});

test("The rating is parsed once at the seam: missing, extra, or mistyped fields are refused", () => {
  assert.deepEqual(parseResearchTierRating({ ...answers({ dense: true }), reason: "  Dense. " }), { ...answers({ dense: true }), reason: "Dense." });
  for (const bad of [
    null, [], {}, { ...answers(), extra: true }, { niche: false, scholarly: false, dense: false },
    { ...answers(), niche: "false" }, { ...answers(), reason: " " }, { ...answers(), reason: "x".repeat(301) },
  ]) {
    assert.throws(() => parseResearchTierRating(bad), ModelError, JSON.stringify(bad));
  }
});
