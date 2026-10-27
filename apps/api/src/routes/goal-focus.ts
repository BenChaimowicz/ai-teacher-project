import type { FastifyInstance, FastifyReply } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import {
  courseRequests,
  MAX_FOCUS_ROUNDS,
  type CourseRequestStatus,
  type FocusAnswer,
  type FocusProposal,
  type FocusRound,
  type GoalFocus,
  type GoalScope,
  type ValidityClarification,
} from "@senoy/db";
import { createGoalFocuser, type FocusTurn, type GoalFocuser } from "../lib/goal-focus.ts";
import { recordProductEvent, withPipelineEvent } from "../lib/usage-tracking.ts";

/** Learner-facing Request fields; ownership is never exposed. */
const requestFields = {
  id: courseRequests.id,
  subject: courseRequests.subject,
  learningGoal: courseRequests.learningGoal,
  status: courseRequests.status,
  createdAt: courseRequests.createdAt,
  validity: courseRequests.validity,
  clarification: courseRequests.clarification,
  focus: courseRequests.focus,
  revisedFromId: courseRequests.revisedFromId,
  failureReason: courseRequests.failureReason,
};

/** A Request as these routes read it. */
type RequestRow = {
  id: string;
  subject: string;
  learningGoal: string;
  status: CourseRequestStatus;
  clarification: ValidityClarification | null;
  focus: GoalFocus | null;
};

/** Injectable focuser; persistence and HTTP semantics stay in these routes. */
type GoalFocusOptions = { goalFocuser?: GoalFocuser };

/** Route parameters for one Request. */
type RequestParams = { Params: { requestId: string } };

/** The longest answer a Learner may type under "Something else". */
export const MAX_OWN_WORDS_LENGTH = 300;

/** Shown when the focuser could not finish; nothing was saved. */
export const FOCUS_FAILED_MESSAGE = "Focusing your goal could not finish. Your Request is unchanged; try again.";

/** Shown when a conditional write lost a race. */
const CHANGED_MESSAGE = "This Request changed while focusing your goal. Reload it before continuing.";

/** Shown when an edited scope is not a re-partition of the proposal's own entries. */
export const SCOPE_EDIT_MISMATCH_MESSAGE = "Your changes to the focus didn't match it. Reload and try again.";

/** Accepts only an object body. */
function bodyFields(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

/**
 * Reads the Learner's answers to the open round: exactly one per question, a tapped answer equal to one of that
 * question's options, typed answers trimmed and capped. Returns them in question order, or null when invalid.
 * @param value - Untrusted `answers` from the body
 * @param round - The open round
 */
export function readFocusAnswers(value: unknown, round: FocusRound): FocusAnswer[] | null {
  if (!Array.isArray(value) || value.length !== round.questions.length) return null;
  const byId = new Map<string, FocusAnswer>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const { questionId, answer, ownWords } = entry as Record<string, unknown>;
    const question = round.questions.find((candidate) => candidate.id === questionId);
    if (!question || byId.has(question.id) || typeof answer !== "string" || typeof ownWords !== "boolean") return null;
    const trimmed = answer.trim();
    if (!trimmed || trimmed.length > MAX_OWN_WORDS_LENGTH) return null;
    if (!ownWords && !question.options.includes(trimmed)) return null;
    byId.set(question.id, { questionId: question.id, answer: trimmed, ownWords });
  }
  return round.questions.map((question) => byId.get(question.id)!);
}

/**
 * Reads a Learner-edited scope: the proposal's own entries moved between Covers and Leaves out. Every entry of the
 * proposal appears exactly once across the two lists (exact strings), nothing new is added, and Covers is not empty.
 * @param value - Untrusted `scope` from the body
 * @param proposed - The proposal's scope
 * @returns The edited scope, or null when it is not a re-partition of the proposal
 */
export function readScopeEdit(value: unknown, proposed: GoalScope): GoalScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { inScope, outOfScope } = value as Record<string, unknown>;
  if (!Array.isArray(inScope) || !Array.isArray(outOfScope) || inScope.length === 0) return null;
  if (![...inScope, ...outOfScope].every((entry): entry is string => typeof entry === "string")) return null;
  const expected = [...proposed.inScope, ...proposed.outOfScope];
  const given = [...inScope, ...outOfScope] as string[];
  if (given.length !== expected.length || new Set(given).size !== given.length || !given.every((entry) => expected.includes(entry))) return null;
  return { inScope: [...inScope] as string[], outOfScope: [...outOfScope] as string[] };
}

/**
 * The stored focus after a turn, with server-assigned question ids and the status it leaves the Request in.
 * @param focus - Focus before the turn, with any answers already recorded
 * @param turn - The focuser's move
 * @param notQuite - The proposal the Learner said was not quite right, if that is what this turn answers
 */
function applyTurn(focus: GoalFocus, turn: FocusTurn, notQuite?: FocusProposal): { focus: GoalFocus; status: CourseRequestStatus } {
  if (turn.kind === "precise") {
    if (focus.rounds.length > 0 || notQuite) throw new Error("A precise goal was reported after focusing began.");
    return { focus: { ...focus, outcome: "precise", proposal: null, scope: null }, status: "goal_focused" };
  }
  // The first broad-overview goal written is kept: it is what a skip at any point falls back on.
  if (!focus.broadGoal && turn.broadGoal) focus = { ...focus, broadGoal: turn.broadGoal };
  if (turn.kind === "ask") {
    if (focus.rounds.length >= MAX_FOCUS_ROUNDS || turn.questions.length === 0) throw new Error("Questions were asked with no rounds left.");
    const round = focus.rounds.length + 1;
    const questions = turn.questions.map((question, index) => ({ ...question, id: `r${round}q${index + 1}` }));
    const opened: FocusRound = { questions, answers: null, ...(notQuite ? { afterProposal: notQuite.learningGoal } : {}) };
    return { focus: { ...focus, outcome: null, rounds: [...focus.rounds, opened], proposal: null, scope: null }, status: "awaiting_focus_answers" };
  }
  // "Not quite" always spends a round, so the round limit ends it.
  if (notQuite) throw new Error("A proposal was returned for Not quite.");
  return { focus: { ...focus, outcome: null, proposal: turn.proposal, scope: null }, status: "awaiting_focus_confirmation" };
}

/** Focuses a Learner-owned Request's Learning Goal between Validity and the Starting Level diagnostic (SEN-90). */
export async function goalFocusRoutes(app: FastifyInstance, options: GoalFocusOptions = {}) {
  const focuser = options.goalFocuser ?? createGoalFocuser();

  /** Reads a private Request, never leaking another Learner's history. */
  async function ownedRequest(id: string, learnerId: string, reply: FastifyReply) {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
      reply.code(400).send({ error: "Invalid Course Request id." });
      return null;
    }
    const [row] = await app.db.select(requestFields).from(courseRequests).where(and(
      eq(courseRequests.id, id), eq(courseRequests.learnerId, learnerId),
    )).limit(1);
    if (!row) reply.code(404).send({ error: "Course Request not found." });
    return row ?? null;
  }

  /**
   * Saves a transition only if the Request still has the status and focus it was read with.
   * @returns The updated Request, or null when something else changed it first
   */
  async function save(row: RequestRow, learnerId: string, changes: { status: CourseRequestStatus; focus: GoalFocus; learningGoal?: string }) {
    const [updated] = await app.db.update(courseRequests).set(changes).where(and(
      eq(courseRequests.id, row.id), eq(courseRequests.learnerId, learnerId), eq(courseRequests.status, row.status),
      row.focus ? eq(courseRequests.focus, row.focus) : isNull(courseRequests.focus),
    )).returning(requestFields);
    return updated ?? null;
  }

  /**
   * Asks the focuser for its next move inside a Pipeline Event.
   * @returns The move, or null after logging a provider failure
   */
  async function nextTurn(row: RequestRow, learnerId: string, focus: GoalFocus, log: FastifyInstance["log"], notQuite?: FocusProposal) {
    try {
      return await withPipelineEvent("goal_focus", {
        label: notQuite ? "Not quite" : focus.rounds.length === 0 ? row.subject : `After round ${focus.rounds.length}`,
        courseRequestId: row.id,
        learnerId,
        detail: { rounds: focus.rounds.length, notQuite: Boolean(notQuite) },
      }, async (event) => {
        const turn = await focuser.next({
          subject: row.subject, learningGoal: focus.originalGoal, rounds: focus.rounds, notQuite, clarification: row.clarification,
        });
        // Checked here so a misbehaving focuser leaves the Request unchanged rather than half-written.
        const applied = applyTurn(focus, turn, notQuite);
        event.setDetail({ move: turn.kind });
        return applied;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[goal-focus.ts: nextTurn] Goal focusing failed || requestId=${row.id} || ${message}`);
      return null;
    }
  }

  /** Records a settled goal for the Usage Console. */
  function recordFocused(learnerId: string, courseRequestId: string, focus: GoalFocus) {
    void recordProductEvent("course_request_focused", {
      learnerId, courseRequestId, detail: { outcome: focus.outcome, rounds: focus.rounds.length },
    });
  }

  /** Logs and reports an unexpected failure. */
  function fail(reply: FastifyReply, log: FastifyInstance["log"], where: string, requestId: string, error: unknown, message: string) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error(`[goal-focus.ts: ${where}] ${message} || requestId=${requestId} || ${detail}`);
    return reply.code(500).send({ error: message });
  }

  app.post<RequestParams>("/api/course-requests/:requestId/focus", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      const learnerId = request.currentLearner.id;
      const { answers } = bodyFields(request.body);
      let focus: GoalFocus;
      if (row.status === "validity_passed") {
        if (answers !== undefined) return reply.code(400).send({ error: "There are no focusing questions to answer yet." });
        focus = { outcome: null, originalGoal: row.learningGoal, rounds: [], proposal: null, scope: null };
      } else if (row.status === "awaiting_focus_answers") {
        const open = row.focus?.rounds.at(-1);
        if (!row.focus || !open || open.answers) throw new Error("Stored focusing round is missing.");
        const read = readFocusAnswers(answers, open);
        if (!read) return reply.code(400).send({ error: "Answer every question by choosing an option or writing your own answer." });
        focus = { ...row.focus, rounds: [...row.focus.rounds.slice(0, -1), { ...open, answers: read }] };
      } else {
        return reply.code(409).send({ error: "This Request is not awaiting focusing." });
      }
      const next = await nextTurn(row, learnerId, focus, request.log);
      if (!next) return reply.code(502).send({ error: FOCUS_FAILED_MESSAGE });
      const updated = await save(row, learnerId, next);
      if (!updated) return reply.code(409).send({ error: CHANGED_MESSAGE });
      if (next.status === "goal_focused") recordFocused(learnerId, row.id, next.focus);
      return { courseRequest: updated };
    } catch (error) {
      return fail(reply, request.log, "focus", request.params.requestId, error, "Could not save your focusing answers. Reload the Request before trying again.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/focus/confirm", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      const proposal = row.focus?.proposal;
      if (row.status !== "awaiting_focus_confirmation" || !row.focus || !proposal) {
        return reply.code(409).send({ error: "There is no focused goal to confirm." });
      }
      // No body confirms as proposed; a `scope` is the Learner's own re-partition of the proposal's entries.
      const { scope: edit } = bodyFields(request.body);
      const scope = edit === undefined ? proposal.scope : readScopeEdit(edit, proposal.scope);
      if (!scope) return reply.code(400).send({ error: SCOPE_EDIT_MISMATCH_MESSAGE });
      // The proposal records what was confirmed, so history shows the edited lists.
      const focus: GoalFocus = { ...row.focus, outcome: "focused", proposal: { ...proposal, scope }, scope };
      const updated = await save(row, request.currentLearner.id, { status: "goal_focused", focus, learningGoal: proposal.learningGoal });
      if (!updated) return reply.code(409).send({ error: CHANGED_MESSAGE });
      recordFocused(request.currentLearner.id, row.id, focus);
      return { courseRequest: updated };
    } catch (error) {
      return fail(reply, request.log, "confirm", request.params.requestId, error, "Could not confirm your focused goal. Reload the Request before trying again.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/focus/not-quite", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      const proposal = row.focus?.proposal;
      if (row.status !== "awaiting_focus_confirmation" || !row.focus || !proposal) {
        return reply.code(409).send({ error: "There is no focused goal to change." });
      }
      if (row.focus.rounds.length >= MAX_FOCUS_ROUNDS) {
        return reply.code(409).send({ error: "There are no more questions to ask. Confirm this goal, or skip for a broad overview." });
      }
      const next = await nextTurn(row, request.currentLearner.id, row.focus, request.log, proposal);
      if (!next) return reply.code(502).send({ error: FOCUS_FAILED_MESSAGE });
      const updated = await save(row, request.currentLearner.id, next);
      if (!updated) return reply.code(409).send({ error: CHANGED_MESSAGE });
      return { courseRequest: updated };
    } catch (error) {
      return fail(reply, request.log, "not-quite", request.params.requestId, error, "Could not reopen focusing. Reload the Request before trying again.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/focus/skip", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if ((row.status !== "awaiting_focus_answers" && row.status !== "awaiting_focus_confirmation") || !row.focus) {
        return reply.code(409).send({ error: "This Request is not awaiting focusing." });
      }
      // A deliberate broad overview: the goal stays exactly as the Learner typed it, with no scope.
      const focus: GoalFocus = { ...row.focus, outcome: "broad_overview", proposal: null, scope: null };
      const updated = await save(row, request.currentLearner.id, { status: "goal_focused", focus, learningGoal: row.focus.broadGoal ?? row.focus.originalGoal });
      if (!updated) return reply.code(409).send({ error: CHANGED_MESSAGE });
      recordFocused(request.currentLearner.id, row.id, focus);
      return { courseRequest: updated };
    } catch (error) {
      return fail(reply, request.log, "skip", request.params.requestId, error, "Could not skip focusing. Reload the Request before trying again.");
    }
  });
}
