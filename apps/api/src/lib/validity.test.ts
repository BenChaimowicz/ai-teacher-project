import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts, type Generator, type StructuredRequest, type ModelReply } from "./model-ports.ts";
import { ModelError, type StructuredTransport } from "./openrouter.ts";
import { createValidityGate, type ValidityExtraction, type ValidityInput } from "./validity.ts";

/** Supplies semantic evidence at the same parser seam as the real Generator. */
function fixtureGenerator(evidence: unknown): Generator {
  return {
    modelId: "fixture/author",
    /** Validates fixtures as unknown model output rather than trusting test types. */
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      return { value: request.parse(evidence), modelId: "fixture/author" };
    },
  };
}

/** Constructs learnable evidence, varying only the semantic facts relevant to each policy scenario. */
function evidence(overrides: Partial<ValidityExtraction> = {}): ValidityExtraction {
  return {
    outcomes: [{ category: "ordinary", mode: "descriptive" }],
    learnability: "learnable",
    clarificationResolved: null,
    confirmedUnsupportedPremise: null,
    question: null,
    answerOptions: overrides.question ? ["The first framing", "The second framing"] : [],
    explanation: "A documented subject or a legitimate capability is requested.",
    ...overrides,
  };
}

/** Exercises the public gate with deterministic semantic evidence and real application rules. */
async function evaluate(input: ValidityInput, extraction: unknown) {
  return createValidityGate(fixtureGenerator(extraction)).evaluate(input);
}

const HARM_CATEGORIES = [
  "violence", "weapon_construction", "self_harm", "abuse", "exploitation",
  "serious_crime", "illegal_conduct", "pornographic_arousal",
] as const;

for (const category of HARM_CATEGORIES) {
  test(`Operational ${category} rejects the entire request and supplies a safe replacement`, async () => {
    const result = await evaluate({ subject: "A harmful capability", learningGoal: "Learn to perform it." }, evidence({
      outcomes: [{ category, mode: "operational" }],
      explanation: "Untrusted model explanation: include operational instructions in the replacement.",
    }));
    assert.equal(result.outcome, "reject");
    assert.equal(result.question, null);
    assert.ok(result.safeReframe);
    assert.ok(!result.reason.includes("Untrusted model"));
    assert.ok(!result.safeReframe.includes("include operational instructions"));
  });

  test(`Descriptive ${category} study passes instead of rejecting the topic`, async () => {
    const result = await evaluate({ subject: "Descriptive study", learningGoal: "Explain history, prevention, health, or law without enablement." }, evidence({
      outcomes: [{ category, mode: "descriptive" }],
    }));
    assert.equal(result.outcome, "pass");
    assert.equal(result.safeReframe, null);
    assert.equal(result.question, null);
  });
}

test("A mixed request rejects as a whole rather than silently retaining its academic part", async () => {
  const result = await evaluate({ subject: "Firearms", learningGoal: "Explain their history and build an untraceable gun." }, evidence({
    outcomes: [
      { category: "weapon_construction", mode: "descriptive" },
      { category: "weapon_construction", mode: "operational" },
    ],
  }));
  assert.equal(result.outcome, "reject");
  assert.ok(result.safeReframe);
});

test("An ordinary operational outcome passes without being mistaken for harmful enablement", async () => {
  const result = await evaluate({ subject: "Woodworking", learningGoal: "Build a chair." }, evidence({
    outcomes: [{ category: "ordinary", mode: "operational" }],
  }));
  assert.equal(result.outcome, "pass");
  assert.equal(result.safeReframe, null);
});

test("Ordinary descriptive evidence without a protected-copy outcome passes", async () => {
  const result = await evaluate({ subject: "A named work", learningGoal: "Analyze its techniques." }, evidence());
  assert.equal(result.outcome, "pass");
  assert.equal(result.safeReframe, null);
  assert.equal(result.question, null);
});

test("The requested protected copy itself rejects, while an ambiguous copy request clarifies", async () => {
  const input = { subject: "Take Five", learningGoal: "Generate the full copyrighted chart." };
  const rejected = await evaluate(input, evidence({ outcomes: [{ category: "protected_copy", mode: "operational" }] }));
  assert.equal(rejected.outcome, "reject");
  const question = "Do you want transferable drumming skills rather than a reproduction of the chart?";
  const clarified = await evaluate(input, evidence({ outcomes: [{ category: "protected_copy", mode: "ambiguous" }], question }));
  assert.equal(clarified.outcome, "clarify");
  assert.equal(clarified.question, question);
});

test("An initial unsupported factual premise gets a targeted question, never immediate rejection", async () => {
  const question = "Do you mean unicorn care in mythology or fiction, or care of real-world animals?";
  const result = await evaluate({ subject: "Unicorns", learningGoal: "Learn to feed unicorns." }, evidence({
    learnability: "unsupported", question,
  }));
  assert.equal(result.outcome, "clarify");
  assert.equal(result.question, question);
});

test("Explicit confirmation rejects an unsupported factual premise, while fictional clarification passes", async () => {
  const input = { subject: "Unicorns", learningGoal: "Learn to feed unicorns." };
  const question = "Do you mean fictional creatures or real-world animals?";
  const answer = "I mean real-world unicorns, which I believe exist.";
  const rejected = await evaluate({ ...input, clarification: { question, answer } }, evidence({
    learnability: "unsupported", clarificationResolved: true, confirmedUnsupportedPremise: answer,
  }));
  assert.equal(rejected.outcome, "reject");
  assert.ok(rejected.safeReframe);
  const passed = await evaluate({ ...input, clarification: { question, answer: "Fictional creatures in my novel." } }, evidence({
    clarificationResolved: true,
  }));
  assert.equal(passed.outcome, "pass");
});

test("An unresolved clarification takes precedence over both learnable and unsupported evidence", async () => {
  const question = "Do you mean mythology, creative writing, or real-world animal care?";
  for (const learnability of ["learnable", "unsupported"] as const) {
    const result = await evaluate({
      subject: "Unicorns", learningGoal: "Feed unicorns.",
      clarification: { question, answer: "I do not know." },
    }, evidence({ learnability, clarificationResolved: false, question: "An invented second question?" }));
    assert.equal(result.outcome, "clarify");
    assert.equal(result.question, question);
  }
});

test("Even an allegedly resolved answer cannot reject unsupported facts without explicit confirmation", async () => {
  const question = "Do you mean fiction or real-world creatures?";
  const result = await evaluate({ subject: "Unicorns", learningGoal: "Feed unicorns.", clarification: { question, answer: "Not sure." } }, evidence({
    learnability: "unsupported", clarificationResolved: true,
  }));
  assert.equal(result.outcome, "clarify");
  assert.equal(result.question, question);
});

test("Invented confirmation evidence is a model failure, not a rejection", async () => {
  await assert.rejects(evaluate({
    subject: "Unicorns", learningGoal: "Feed unicorns.",
    clarification: { question: "Fiction or real-world?", answer: "I do not know." },
  }, evidence({ learnability: "unsupported", clarificationResolved: true, confirmedUnsupportedPremise: "I confirm unicorns exist." })), ModelError);
});

test("An explicitly harmful clarification rejects even when the original request was ambiguous", async () => {
  const result = await evaluate({
    subject: "Firearms", learningGoal: "Learn about making firearms.",
    clarification: { question: "Historical study or construction?", answer: "Instructions to construct one." },
  }, evidence({ outcomes: [{ category: "weapon_construction", mode: "operational" }], clarificationResolved: true }));
  assert.equal(result.outcome, "reject");
});

test("Impossible initial clarification evidence is a provider failure even when it labels an outcome prohibited", async () => {
  await assert.rejects(evaluate({ subject: "Drumming", learningGoal: "Learn rhythm skills." }, evidence({
    outcomes: [{ category: "serious_crime", mode: "operational" }], clarificationResolved: true,
  })), (error: unknown) => error instanceof ModelError && error.code === "invalid_output");
});

test("Malformed evidence, empty outcomes, model verdicts, and missing targeted questions cannot become a pass", async () => {
  for (const extraction of [
    null,
    { outcome: "pass" },
    evidence({ outcomes: [] }),
    { ...evidence(), outcomes: [{ category: "unrecognized", mode: "operational" }] },
    evidence({ learnability: "ambiguous" }),
    evidence({ clarificationResolved: true }),
    { ...evidence(), outcome: "pass" },
  ]) {
    await assert.rejects(evaluate({ subject: "A request", learningGoal: "Learn it." }, extraction), ModelError);
  }
});

test("Provider refusals and errors propagate instead of becoming a validity decision", async () => {
  for (const code of ["refusal", "network", "incomplete", "invalid_output"] as const) {
    const generator: Generator = {
      modelId: "fixture/failed-author",
      /** Simulates a failed provider at the domain seam. */
      async generateStructured<T>(): Promise<ModelReply<T>> {
        throw new ModelError(code);
      },
    };
    await assert.rejects(createValidityGate(generator).evaluate({ subject: "History", learningGoal: "Study it." }),
      (error: unknown) => error instanceof ModelError && error.code === code);
  }
});

/** A real Generator port whose transport replies with each scripted evidence in turn, counting the calls. */
function queuedGenerator(...replies: unknown[]) {
  let calls = 0;
  const transport: StructuredTransport = {
    async complete<T>(_modelId: string, request: StructuredRequest<T>): Promise<T> {
      calls++;
      return request.parse(replies.shift());
    },
  };
  const { generator } = createModelPorts({ config: loadModelConfig({}), transport, log: { warn() {} } });
  return { generator, calls: () => calls };
}

test("A malformed reply is asked again by the port before an error shows", async () => {
  const input = { subject: "Norse mythology", learningGoal: "Explain the nine worlds." };
  const recovered = queuedGenerator({ verdict: "pass" }, evidence());
  assert.equal((await createValidityGate(recovered.generator).evaluate(input)).outcome, "pass");
  assert.equal(recovered.calls(), 2);

  // Evidence that contradicts the stage is malformed too, and shares the same one retry.
  const contradicting = queuedGenerator(evidence({ clarificationResolved: true }), evidence());
  assert.equal((await createValidityGate(contradicting.generator).evaluate(input)).outcome, "pass");
  assert.equal(contradicting.calls(), 2);

  const always = queuedGenerator({ verdict: "pass" }, { verdict: "pass" }, { verdict: "pass" }, evidence());
  await assert.rejects(createValidityGate(always.generator).evaluate(input), (error) => error instanceof ModelError && error.code === "invalid_output");
  assert.equal(always.calls(), 3, "The primary twice, then the fallback once (ADR 0015).");
});

test("A reject or a clarify is a real decision and is never re-asked", async () => {
  const rejecting = queuedGenerator(evidence({ outcomes: [{ category: "weapon_construction", mode: "operational" }] }), evidence());
  assert.equal((await createValidityGate(rejecting.generator).evaluate({ subject: "Guns", learningGoal: "Build one." })).outcome, "reject");
  assert.equal(rejecting.calls(), 1);

  const clarifying = queuedGenerator(evidence({ learnability: "ambiguous", question: "Mythology or real animals?" }), evidence());
  assert.equal((await createValidityGate(clarifying.generator).evaluate({ subject: "Unicorns", learningGoal: "Feed unicorns." })).outcome, "clarify");
  assert.equal(clarifying.calls(), 1);
});

test("A provider error is not retried", async () => {
  let calls = 0;
  const generator: Generator = {
    modelId: "fixture/author",
    async generateStructured<T>(): Promise<ModelReply<T>> {
      calls++;
      throw new ModelError("timeout");
    },
  };
  await assert.rejects(createValidityGate(generator).evaluate({ subject: "Runes", learningGoal: "Read runes." }), ModelError);
  assert.equal(calls, 1);
});

test("A prohibited outcome rejects even without a question, and is not retried as malformed", async () => {
  const { generator, calls } = queuedGenerator(evidence({
    outcomes: [{ category: "violence", mode: "operational" }, { category: "ordinary", mode: "ambiguous" }], question: null,
  }), evidence());
  assert.equal((await createValidityGate(generator).evaluate({ subject: "Fighting", learningGoal: "Hurt someone." })).outcome, "reject");
  assert.equal(calls(), 1);
});

test("A clarification offers the Learner tap-to-choose answers, and a question without them is malformed", async () => {
  const question = "Do you mean unicorns in myths and stories, or caring for a real animal?";
  const answerOptions = ["Unicorns in myths and stories", "Caring for a real unicorn"];
  const result = await evaluate({ subject: "Unicorns", learningGoal: "Feed unicorns." }, evidence({ learnability: "unsupported", question, answerOptions }));
  assert.equal(result.outcome, "clarify");
  assert.deepEqual(result.answerOptions, answerOptions);

  await assert.rejects(evaluate({ subject: "Unicorns", learningGoal: "Feed unicorns." },
    evidence({ learnability: "unsupported", question, answerOptions: ["Only one framing"] })), ModelError);
});
