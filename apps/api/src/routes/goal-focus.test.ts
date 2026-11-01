import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import {
  courseRequests,
  learners,
  MAX_FOCUS_ROUNDS,
  parseTeachingProfileAnswers,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  type CourseRequestStatus,
  type DiagnosticItem,
  type GoalFocus,
  type GoalScope,
} from "@senoy/db";
import type { DiagnosticBuilder } from "../lib/diagnostic.ts";
import type { FocusTurnInput, GoalFocuser } from "../lib/goal-focus.ts";
import {
  createFixtureGoalFocuser,
  fixtureBroadGoal,
  FIXTURE_FOCUS_DEPTH_OPTIONS,
  FIXTURE_FOCUS_DEPTH_QUESTION,
  FIXTURE_FOCUS_OUT_OF_SCOPE,
  FIXTURE_FOCUS_PART_OPTIONS,
  FIXTURE_FOCUS_PART_QUESTION,
} from "../lib/goal-focus-fixture.ts";
import { fakeDb } from "./fake-db.ts";
import { FOCUS_FAILED_MESSAGE, goalFocusRoutes, SCOPE_EDIT_MISMATCH_MESSAGE } from "./goal-focus.ts";
import { startingLevelRoutes } from "./starting-level.ts";

/** A Learner with a saved Teaching Profile. */
function savedLearner(): typeof learners.$inferSelect {
  return {
    id: randomUUID(),
    createdAt: new Date(),
    authUserId: randomUUID(),
    displayName: "Curious_Owl",
    teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers({}),
    teachingProfileAssessedAt: new Date(),
    teachingProfileUpdatedAt: new Date(),
  };
}

/** A broad subject the fixture focuser questions, and the goal as typed. */
const BROAD_SUBJECT = "Astronomy [broad]";
const ORIGINAL_GOAL = "Learn about the sky.";

/** A minimal ready diagnostic, so the Starting Level route can run after focusing. */
const draft = {
  capabilities: [{ id: "cap1", statement: "Capability", itemId: "item1", span: 1 }],
  items: [{ id: "item1", capabilityId: "cap1", kind: "knowledge", stem: "Q?", options: ["A", "B", "C"], keyIndex: 1, warrant: "W" } satisfies DiagnosticItem],
  reviews: [],
  coverageNote: "Written knowledge only.",
  authorModelId: "fixture/author",
  judgeModelId: "fixture/judge",
  factCheckVendor: "you-research",
} as const;

/**
 * Runs the real focus and Starting Level routes on in-memory storage with one Request.
 * @param options.status - The Request's status
 * @param options.subject - Its subject
 * @param options.focus - Its stored focus
 * @param options.focuser - The focuser; defaults to the deterministic fixture
 * @param options.clarification - Validity's settled clarification, if any
 */
async function testApp(options: {
  status?: CourseRequestStatus; subject?: string; focus?: GoalFocus | null; focuser?: GoalFocuser;
  clarification?: { question: string; answer: string } | null;
} = {}) {
  const learner = savedLearner();
  const { db, rows } = fakeDb([courseRequests, startingLevelDiagnostics]);
  const scopes: (GoalScope | null | undefined)[] = [];
  const builder: DiagnosticBuilder = {
    async build(input) {
      scopes.push(input.scope);
      return structuredClone(draft) as never;
    },
    async writeGapStatement() { return "Gap"; },
  };
  let calls = 0;
  const inputs: FocusTurnInput[] = [];
  const base = options.focuser ?? createFixtureGoalFocuser();
  const counting: GoalFocuser = { next: (input) => { calls += 1; inputs.push(input); return base.next(input); } };
  const app = Fastify();
  app.decorate("db", db);
  app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
  await app.register(goalFocusRoutes, { goalFocuser: counting });
  await app.register(startingLevelRoutes, { diagnosticBuilder: builder });
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner.id, subject: options.subject ?? BROAD_SUBJECT, learningGoal: ORIGINAL_GOAL,
    status: options.status ?? "validity_passed", focus: options.focus ?? null, clarification: options.clarification ?? null,
  }).returning();
  const url = `/api/course-requests/${request!.id}`;
  return { app, url, learner, scopes, inputs, calls: () => calls, row: rows.get(courseRequests)![0]! };
}

/** Taps the first option of every fixture question. */
function tapped(round: number, part = FIXTURE_FOCUS_PART_OPTIONS[0]!, depth = FIXTURE_FOCUS_DEPTH_OPTIONS[1]!) {
  return [
    { questionId: `r${round}q1`, answer: part, ownWords: false },
    { questionId: `r${round}q2`, answer: depth, ownWords: false },
  ];
}

/** A stored focus with `count` answered rounds and an open proposal. */
function proposedFocus(count: number): GoalFocus {
  return {
    outcome: null, originalGoal: ORIGINAL_GOAL,
    rounds: Array.from({ length: count }, (_, i) => ({
      questions: [{ id: `r${i + 1}q1`, question: FIXTURE_FOCUS_PART_QUESTION, options: [...FIXTURE_FOCUS_PART_OPTIONS] }],
      answers: [{ questionId: `r${i + 1}q1`, answer: FIXTURE_FOCUS_PART_OPTIONS[0]!, ownWords: false }],
    })),
    proposal: { learningGoal: "Explain the sky.", scope: { inScope: ["The sky"], outOfScope: ["The ground"] } },
    scope: null,
  };
}

test("A precise goal passes straight to goal_focused with no questions", async () => {
  const { app, url, row } = await testApp({ subject: "Astronomy" });
  try {
    const response = await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    const { courseRequest } = response.json();
    assert.equal(courseRequest.status, "goal_focused");
    assert.deepEqual(courseRequest.focus, { outcome: "precise", originalGoal: ORIGINAL_GOAL, rounds: [], proposal: null, scope: null });
    assert.equal(courseRequest.learningGoal, ORIGINAL_GOAL);
    assert.equal(row.status, "goal_focused");
  } finally { await app.close(); }
});

test("A broad goal is questioned, answers are validated, and a confirmed proposal rewrites the goal and stores its scope", async () => {
  const { app, url, row, calls, scopes } = await testApp();
  try {
    const asked = await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    assert.equal(asked.statusCode, 200, asked.body);
    const opened = asked.json().courseRequest;
    assert.equal(opened.status, "awaiting_focus_answers");
    assert.deepEqual(opened.focus.rounds, [{
      questions: [
        { id: "r1q1", question: FIXTURE_FOCUS_PART_QUESTION, options: FIXTURE_FOCUS_PART_OPTIONS },
        { id: "r1q2", question: FIXTURE_FOCUS_DEPTH_QUESTION, options: FIXTURE_FOCUS_DEPTH_OPTIONS },
      ],
      answers: null,
    }]);
    assert.equal(opened.focus.outcome, null);
    assert.equal((await app.inject({ method: "POST", url: `${url}/diagnostic` })).statusCode, 409, "No diagnostic while questions are open.");

    const invalid = [
      undefined,
      [],
      tapped(1).slice(0, 1),
      [tapped(1)[0], tapped(1)[0]],
      [{ ...tapped(1)[0], answer: "Not an option" }, tapped(1)[1]],
      [{ ...tapped(1)[0], questionId: "r9q1" }, tapped(1)[1]],
      [{ ...tapped(1)[0], answer: "   ", ownWords: true }, tapped(1)[1]],
      [{ ...tapped(1)[0], answer: "x".repeat(301), ownWords: true }, tapped(1)[1]],
      [{ questionId: "r1q1", answer: FIXTURE_FOCUS_PART_OPTIONS[0] }, tapped(1)[1]],
    ];
    for (const answers of invalid) {
      const response = await app.inject({ method: "POST", url: `${url}/focus`, payload: { answers } });
      assert.equal(response.statusCode, 400, JSON.stringify(answers));
    }
    assert.equal(calls(), 1, "Invalid answers must not consume a model call.");
    assert.equal(row.status, "awaiting_focus_answers");

    const ownWords = "  The planets and their moons  ";
    const answered = await app.inject({
      method: "POST", url: `${url}/focus`,
      payload: { answers: [tapped(1)[1], { questionId: "r1q1", answer: ownWords, ownWords: true }] },
    });
    assert.equal(answered.statusCode, 200, answered.body);
    const proposed = answered.json().courseRequest;
    assert.equal(proposed.status, "awaiting_focus_confirmation");
    assert.deepEqual(proposed.focus.rounds[0].answers, [
      { questionId: "r1q1", answer: ownWords.trim(), ownWords: true },
      tapped(1)[1],
    ], "Answers are stored trimmed, in question order.");
    assert.deepEqual(proposed.focus.proposal, {
      learningGoal: "Explain the planets and their moons in Astronomy",
      scope: { inScope: [ownWords.trim(), FIXTURE_FOCUS_DEPTH_OPTIONS[1]], outOfScope: FIXTURE_FOCUS_OUT_OF_SCOPE },
    });
    assert.equal(proposed.learningGoal, ORIGINAL_GOAL, "The goal changes only on confirm.");

    const confirmed = await app.inject({ method: "POST", url: `${url}/focus/confirm` });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    const focused = confirmed.json().courseRequest;
    assert.equal(focused.status, "goal_focused");
    assert.equal(focused.learningGoal, "Explain the planets and their moons in Astronomy");
    assert.equal(focused.focus.outcome, "focused");
    assert.equal(focused.focus.originalGoal, ORIGINAL_GOAL);
    assert.deepEqual(focused.focus.scope, proposed.focus.proposal.scope);
    assert.deepEqual((await app.inject({ method: "GET", url: `${url}/diagnostic` })).json().courseRequest, focused);

    const diagnostic = await app.inject({ method: "POST", url: `${url}/diagnostic` });
    assert.equal(diagnostic.statusCode, 200, diagnostic.body);
    assert.equal(diagnostic.json().courseRequest.status, "assessment_ready");
    assert.deepEqual(scopes, [proposed.focus.proposal.scope], "The diagnostic is written within the confirmed scope.");
  } finally { await app.close(); }
});

test("Validity's settled clarification reaches every focusing turn", async () => {
  const clarification = { question: "Do you mean the night sky or space travel?", answer: "The night sky" };
  const { app, url, inputs } = await testApp({ clarification });
  try {
    await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    await app.inject({ method: "POST", url: `${url}/focus`, payload: { answers: tapped(1) } });
    await app.inject({ method: "POST", url: `${url}/focus/not-quite` });
    assert.equal(inputs.length, 3);
    for (const input of inputs) assert.deepEqual(input.clarification, clarification);
  } finally { await app.close(); }
  const plain = await testApp();
  try {
    await plain.app.inject({ method: "POST", url: `${plain.url}/focus`, payload: {} });
    assert.equal(plain.inputs[0]!.clarification, null);
  } finally { await plain.app.close(); }
});

test("Confirm accepts the Learner's own re-partition of the proposal's entries and records it on the proposal", async () => {
  const proposal = { learningGoal: "Explain the sky.", scope: { inScope: ["The sky", "Stars"], outOfScope: ["The ground"] } };
  const focus: GoalFocus = { ...proposedFocus(1), proposal };
  const edited = { inScope: ["The ground", "The sky"], outOfScope: ["Stars"] };
  const { app, url, row, scopes } = await testApp({ status: "awaiting_focus_confirmation", focus });
  try {
    const confirmed = await app.inject({ method: "POST", url: `${url}/focus/confirm`, payload: { scope: edited } });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    const { courseRequest } = confirmed.json();
    assert.equal(courseRequest.status, "goal_focused");
    assert.equal(courseRequest.learningGoal, proposal.learningGoal);
    assert.deepEqual(courseRequest.focus.scope, edited);
    assert.deepEqual(courseRequest.focus.proposal, { learningGoal: proposal.learningGoal, scope: edited });
    assert.deepEqual((row.focus as GoalFocus).scope, edited);
    await app.inject({ method: "POST", url: `${url}/diagnostic` });
    assert.deepEqual(scopes, [edited], "The diagnostic reads the edited scope.");
  } finally { await app.close(); }
});

test("Confirm refuses an edited scope that is not a re-partition of the proposal, and changes nothing", async () => {
  const proposal = { learningGoal: "Explain the sky.", scope: { inScope: ["The sky", "Stars"], outOfScope: ["The ground"] } };
  const invalid: unknown[] = [
    null,
    "The sky",
    { inScope: ["The sky", "Stars"] },
    { inScope: [], outOfScope: ["The sky", "Stars", "The ground"] },
    { inScope: ["The sky", "Stars"], outOfScope: [] },
    { inScope: ["The sky", "Stars", "The ground", "Planets"], outOfScope: [] },
    { inScope: ["The sky", "Stars", "Planets"], outOfScope: [] },
    { inScope: ["The sky", "Stars"], outOfScope: ["The sky"] },
    { inScope: ["The sky", "Stars", "Stars"], outOfScope: [] },
    { inScope: ["the sky", "Stars"], outOfScope: ["The ground"] },
    { inScope: ["The sky", "Stars"], outOfScope: [42] },
  ];
  for (const scope of invalid) {
    const { app, url, row } = await testApp({ status: "awaiting_focus_confirmation", focus: { ...proposedFocus(1), proposal } });
    try {
      const before = structuredClone(row);
      const response = await app.inject({ method: "POST", url: `${url}/focus/confirm`, payload: { scope } });
      assert.equal(response.statusCode, 400, JSON.stringify(scope));
      assert.equal(response.json().error, SCOPE_EDIT_MISMATCH_MESSAGE);
      assert.deepEqual(row, before);
    } finally { await app.close(); }
  }
});

test("Not quite opens another round that records the proposal it answers, and is refused when no rounds are left", async () => {
  const { app, url } = await testApp();
  try {
    await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    const proposed = (await app.inject({ method: "POST", url: `${url}/focus`, payload: { answers: tapped(1) } })).json().courseRequest;
    const reopened = await app.inject({ method: "POST", url: `${url}/focus/not-quite` });
    assert.equal(reopened.statusCode, 200, reopened.body);
    const round = reopened.json().courseRequest;
    assert.equal(round.status, "awaiting_focus_answers");
    assert.equal(round.focus.proposal, null);
    assert.equal(round.focus.rounds.length, 2);
    assert.equal(round.focus.rounds[1].afterProposal, proposed.focus.proposal.learningGoal);
    assert.deepEqual(round.focus.rounds[1].questions.map((question: { id: string }) => question.id), ["r2q1", "r2q2"]);
    const again = await app.inject({ method: "POST", url: `${url}/focus`, payload: { answers: tapped(2, FIXTURE_FOCUS_PART_OPTIONS[1]) } });
    assert.equal(again.json().courseRequest.focus.proposal.learningGoal, "Explain where our knowledge comes from in Astronomy");
  } finally { await app.close(); }

  const exhausted = await testApp({ status: "awaiting_focus_confirmation", focus: proposedFocus(MAX_FOCUS_ROUNDS) });
  try {
    const refused = await exhausted.app.inject({ method: "POST", url: `${exhausted.url}/focus/not-quite` });
    assert.equal(refused.statusCode, 409);
    assert.equal(exhausted.calls(), 0);
    assert.equal(exhausted.row.status, "awaiting_focus_confirmation");
  } finally { await exhausted.app.close(); }
});

test("Skip from either open status records a broad overview with the Course Guide's broad-overview goal", async () => {
  for (const status of ["awaiting_focus_answers", "awaiting_focus_confirmation"] as const) {
    const { app, url } = await testApp();
    try {
      await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
      if (status === "awaiting_focus_confirmation") await app.inject({ method: "POST", url: `${url}/focus`, payload: { answers: tapped(1) } });
      const skipped = await app.inject({ method: "POST", url: `${url}/focus/skip` });
      assert.equal(skipped.statusCode, 200, skipped.body);
      const { courseRequest } = skipped.json();
      assert.equal(courseRequest.status, "goal_focused");
      assert.equal(courseRequest.learningGoal, fixtureBroadGoal(courseRequest.subject));
      assert.equal(courseRequest.focus.originalGoal, ORIGINAL_GOAL);
      assert.equal(courseRequest.focus.outcome, "broad_overview");
      assert.equal(courseRequest.focus.scope, null);
      assert.equal(courseRequest.focus.proposal, null);
      assert.equal((await app.inject({ method: "POST", url: `${url}/diagnostic` })).statusCode, 200);
    } finally { await app.close(); }
  }
});

test("Each focus action answers 409 in the wrong status", async () => {
  const cases: [CourseRequestStatus, string, Record<string, unknown>][] = [
    ["awaiting_validity", "/focus", {}],
    ["goal_focused", "/focus", {}],
    ["assessment_ready", "/focus", {}],
    ["validity_passed", "/focus/confirm", {}],
    ["validity_passed", "/focus/not-quite", {}],
    ["validity_passed", "/focus/skip", {}],
    ["goal_focused", "/focus/skip", {}],
  ];
  for (const [status, action, payload] of cases) {
    const focus = status === "goal_focused" ? { ...proposedFocus(1), outcome: "precise" as const } : null;
    const { app, url, calls } = await testApp({ status, focus });
    try {
      assert.equal((await app.inject({ method: "POST", url: `${url}${action}`, payload })).statusCode, 409, `${status} ${action}`);
      assert.equal(calls(), 0);
    } finally { await app.close(); }
  }
  const { app, url } = await testApp();
  try {
    await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    for (const action of ["/focus/confirm", "/focus/not-quite"]) {
      assert.equal((await app.inject({ method: "POST", url: `${url}${action}` })).statusCode, 409, action);
    }
  } finally { await app.close(); }
});

test("A provider failure answers 502 and leaves the Request unchanged", async () => {
  let fail = true;
  const fixture = createFixtureGoalFocuser();
  const { app, url, row } = await testApp({
    focuser: { async next(input) { if (fail) throw new Error("provider down"); return fixture.next(input); } },
  });
  try {
    const before = structuredClone(row);
    const failed = await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    assert.equal(failed.statusCode, 502);
    assert.equal(failed.json().error, FOCUS_FAILED_MESSAGE);
    assert.deepEqual(row, before);
    fail = false;
    await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    fail = true;
    const open = structuredClone(row);
    assert.equal((await app.inject({ method: "POST", url: `${url}/focus`, payload: { answers: tapped(1) } })).statusCode, 502);
    assert.deepEqual(row, open, "The answers are not saved without the next move.");
  } finally { await app.close(); }
});

test("A focuser that asks with no rounds left is treated as a failure, not saved", async () => {
  const focus: GoalFocus = { ...proposedFocus(MAX_FOCUS_ROUNDS), proposal: null };
  focus.rounds[MAX_FOCUS_ROUNDS - 1]!.answers = null;
  const { app, url, row } = await testApp({
    status: "awaiting_focus_answers", focus,
    focuser: { async next() { return { kind: "ask", questions: [{ id: "x", question: "More?", options: ["A", "B"] }], broadGoal: null }; } },
  });
  try {
    const response = await app.inject({
      method: "POST", url: `${url}/focus`,
      payload: { answers: [{ questionId: `r${MAX_FOCUS_ROUNDS}q1`, answer: FIXTURE_FOCUS_PART_OPTIONS[0], ownWords: false }] },
    });
    assert.equal(response.statusCode, 502);
    assert.equal(row.status, "awaiting_focus_answers");
  } finally { await app.close(); }
});

test("A concurrent focusing turn that lost the race answers 409", async () => {
  const fixture = createFixtureGoalFocuser();
  const { promise: held, resolve: release } = Promise.withResolvers<void>();
  let call = 0;
  const { app, url, row } = await testApp({
    focuser: { async next(input) { if (++call === 1) await held; return fixture.next(input); } },
  });
  try {
    const slow = app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    await new Promise((resolve) => setImmediate(resolve));
    const fast = await app.inject({ method: "POST", url: `${url}/focus`, payload: {} });
    assert.equal(fast.statusCode, 200, fast.body);
    release();
    assert.equal((await slow).statusCode, 409);
    assert.equal((row.focus as GoalFocus).rounds.length, 1);
  } finally { await app.close(); }
});

test("The diagnostic refuses a Request that has only passed Validity", async () => {
  const { app, url } = await testApp();
  try {
    assert.equal((await app.inject({ method: "POST", url: `${url}/diagnostic` })).statusCode, 409);
  } finally { await app.close(); }
});

test("Another Learner's Request is not found", async () => {
  const { app, url, learner } = await testApp();
  try {
    learner.id = randomUUID();
    for (const action of ["/focus", "/focus/confirm", "/focus/not-quite", "/focus/skip"]) {
      assert.equal((await app.inject({ method: "POST", url: `${url}${action}`, payload: {} })).statusCode, 404);
    }
  } finally { await app.close(); }
});
