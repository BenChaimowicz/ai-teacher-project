import type { FastifyInstance, FastifyReply } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import {
  canExpandGap,
  courseRequests,
  expandGap,
  extremityOf,
  learnerItem,
  scoreDiagnostic,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  type CourseRequestStatus,
  type DiagnosticAnswer,
  type GapConfirmation,
  type StartingLevel,
} from "@senoy/db";
import { createDiagnosticBuilder, type DiagnosticBuilder } from "../lib/diagnostic.ts";

/** Learner-facing Request fields; ownership is never exposed. */
const requestFields = {
  id: courseRequests.id,
  subject: courseRequests.subject,
  learningGoal: courseRequests.learningGoal,
  status: courseRequests.status,
  createdAt: courseRequests.createdAt,
  validity: courseRequests.validity,
  clarification: courseRequests.clarification,
  revisedFromId: courseRequests.revisedFromId,
};

/** Injectable diagnostic builder; persistence and HTTP semantics stay in these routes. */
type StartingLevelOptions = { diagnosticBuilder?: DiagnosticBuilder };

/** Route parameters for one Request. */
type RequestParams = { Params: { requestId: string } };

/** A stored diagnostic attempt. */
type Attempt = typeof startingLevelDiagnostics.$inferSelect;

/**
 * What the browser may see of an attempt: items without keys, and the result without per-item correctness.
 * @param attempt - Stored attempt
 */
function learnerView(attempt: Attempt) {
  const level = attempt.startingLevel;
  return {
    id: attempt.id,
    items: attempt.items.map(learnerItem),
    result: level ? {
      remainingGapStatement: level.remainingGapStatement,
      coverageNote: level.coverageNote,
      extremity: level.extremity,
      canExpandGap: canExpandGap(level.probedCapabilities),
    } : null,
    confirmation: attempt.confirmation,
  };
}

/** Accepts only an object body. */
function bodyFields(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

/** Runs, scores, widens, and confirms the Starting Level diagnostic for a Learner-owned Course Request. */
export async function startingLevelRoutes(app: FastifyInstance, options: StartingLevelOptions = {}) {
  const builder = options.diagnosticBuilder ?? createDiagnosticBuilder();

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

  /** The Request's latest diagnostic attempt. */
  async function latestAttempt(requestId: string) {
    const [attempt] = await app.db.select().from(startingLevelDiagnostics)
      .where(eq(startingLevelDiagnostics.courseRequestId, requestId))
      .orderBy(desc(startingLevelDiagnostics.createdAt)).limit(1);
    return attempt ?? null;
  }

  /** Moves a Request between statuses only if nothing else moved it first. */
  async function transition(requestId: string, learnerId: string, from: CourseRequestStatus, to: CourseRequestStatus) {
    const [updated] = await app.db.update(courseRequests).set({ status: to }).where(and(
      eq(courseRequests.id, requestId), eq(courseRequests.learnerId, learnerId), eq(courseRequests.status, from),
    )).returning(requestFields);
    return updated ?? null;
  }

  /** Stores a new Starting Level on the attempt. */
  async function saveStartingLevel(attemptId: string, startingLevel: StartingLevel, extra: Partial<Attempt> = {}) {
    const [saved] = await app.db.update(startingLevelDiagnostics).set({ startingLevel, ...extra })
      .where(eq(startingLevelDiagnostics.id, attemptId)).returning();
    if (!saved) throw new Error("Diagnostic attempt was not saved.");
    return saved;
  }

  /** Logs and reports an unexpected failure. */
  function fail(reply: FastifyReply, log: FastifyInstance["log"], where: string, requestId: string, error: unknown, message: string) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error(`[starting-level.ts: ${where}] ${message} || requestId=${requestId} || ${detail}`);
    return reply.code(500).send({ error: message });
  }

  app.get<RequestParams>("/api/course-requests/:requestId/diagnostic", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      const attempt = await latestAttempt(row.id);
      return { courseRequest: row, diagnostic: attempt && attempt.readyAt ? learnerView(attempt) : null };
    } catch (error) {
      return fail(reply, request.log, "get", request.params.requestId, error, "Failed to load the Starting Level check.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/diagnostic", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "validity_passed") return reply.code(409).send({ error: "This Request is not ready for a Starting Level check." });
      const preparing = await transition(row.id, request.currentLearner.id, "validity_passed", "assessment_preparing");
      if (!preparing) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      let draft;
      try {
        draft = await builder.build({ subject: row.subject, learningGoal: row.learningGoal });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.log.error(`[starting-level.ts: prepare] Diagnostic preparation failed || requestId=${row.id} || ${message}`);
        await transition(row.id, request.currentLearner.id, "assessment_preparing", "validity_passed");
        return reply.code(502).send({ error: "We couldn't prepare your Starting Level check. Your Request is unchanged; try again." });
      }
      const [attempt] = await app.db.insert(startingLevelDiagnostics).values({
        courseRequestId: row.id, learnerId: request.currentLearner.id, ...draft, readyAt: new Date(),
      }).returning();
      if (!attempt) throw new Error("Diagnostic attempt was not saved.");
      const ready = await transition(row.id, request.currentLearner.id, "assessment_preparing", "assessment_ready");
      if (!ready) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      return { courseRequest: ready, diagnostic: learnerView(attempt) };
    } catch (error) {
      return fail(reply, request.log, "prepare", request.params.requestId, error, "Failed to prepare the Starting Level check.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/diagnostic/answers", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "assessment_ready") return reply.code(409).send({ error: "This Request is not awaiting answers." });
      const attempt = await latestAttempt(row.id);
      if (!attempt) throw new Error("Ready Request has no diagnostic attempt.");
      const { answers } = bodyFields(request.body);
      const submitted = bodyFields(answers);
      const itemIds = attempt.items.map((item) => item.id);
      const valid = Object.keys(submitted).length === itemIds.length && itemIds.every((id) => {
        const answer = submitted[id];
        return answer === "dont_know" || (Number.isInteger(answer) && (answer as number) >= 0 && (answer as number) <= 2);
      });
      if (!valid) return reply.code(400).send({ error: "Answer every question with an option or I don't know." });
      const keys = Object.fromEntries(attempt.items.map((item) => [item.id, item.keyIndex]));
      const scored = scoreDiagnostic(attempt.capabilities, keys, submitted as Record<string, DiagnosticAnswer>);
      const remainingGapStatement = await builder.writeGapStatement({
        subject: row.subject, learningGoal: row.learningGoal, extremity: scored.extremity, capabilities: scored.probedCapabilities,
      });
      const saved = await saveStartingLevel(attempt.id, {
        learningGoal: row.learningGoal,
        probedCapabilities: scored.probedCapabilities,
        remainingGapStatement,
        coverageNote: attempt.coverageNote ?? "",
        extremity: scored.extremity,
      }, { answers: submitted as Record<string, DiagnosticAnswer>, submittedAt: new Date() });
      const updated = await transition(row.id, request.currentLearner.id, "assessment_ready", "awaiting_gap_confirmation");
      if (!updated) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      return { courseRequest: updated, diagnostic: learnerView(saved) };
    } catch (error) {
      return fail(reply, request.log, "answers", request.params.requestId, error, "Failed to score the Starting Level check.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/diagnostic/too-easy", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "awaiting_gap_confirmation") return reply.code(409).send({ error: "This Request is not awaiting confirmation." });
      const attempt = await latestAttempt(row.id);
      const level = attempt?.startingLevel;
      if (!attempt || !level) throw new Error("Confirming Request has no Starting Level.");
      if (!canExpandGap(level.probedCapabilities)) return reply.code(409).send({ error: "Everything is already in your Course." });
      const probedCapabilities = expandGap(level.probedCapabilities);
      const extremity = extremityOf(probedCapabilities);
      const remainingGapStatement = await builder.writeGapStatement({
        subject: row.subject, learningGoal: row.learningGoal, extremity, capabilities: probedCapabilities,
      });
      const saved = await saveStartingLevel(attempt.id, { ...level, probedCapabilities, extremity, remainingGapStatement });
      return { courseRequest: row, diagnostic: learnerView(saved) };
    } catch (error) {
      return fail(reply, request.log, "too-easy", request.params.requestId, error, "Failed to widen the remaining gap.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/diagnostic/confirm", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "awaiting_gap_confirmation") return reply.code(409).send({ error: "This Request is not awaiting confirmation." });
      const { choice } = bodyFields(request.body);
      if (choice !== "looks_right" && choice !== "short_course") return reply.code(400).send({ error: "Choose Looks right or Short Course." });
      const attempt = await latestAttempt(row.id);
      const level = attempt?.startingLevel;
      if (!attempt || !level) throw new Error("Confirming Request has no Starting Level.");
      const ceiling = level.extremity === "ceiling";
      if ((choice === "short_course") !== ceiling) {
        return reply.code(409).send({ error: ceiling ? "Choose Short Course, Change my goal, or Too easy." : "Short Course is only offered when nearly everything was right." });
      }
      await saveStartingLevel(attempt.id, level, { confirmation: choice as GapConfirmation, confirmedAt: new Date() });
      const updated = await transition(row.id, request.currentLearner.id, "awaiting_gap_confirmation", "starting_level_confirmed");
      if (!updated) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      return { courseRequest: updated };
    } catch (error) {
      return fail(reply, request.log, "confirm", request.params.requestId, error, "Failed to confirm the Starting Level.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/diagnostic/change-goal", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "awaiting_gap_confirmation") return reply.code(409).send({ error: "This Request is not awaiting confirmation." });
      const attempt = await latestAttempt(row.id);
      if (attempt?.startingLevel?.extremity !== "ceiling") return reply.code(409).send({ error: "Change my goal is offered when nearly everything was right." });
      if (request.currentLearner.teachingProfileVersion !== TEACHING_PROFILE_VERSION || request.currentLearner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before creating a Course Request." });
      }
      const [draft] = await app.db.insert(courseRequests).values({
        learnerId: request.currentLearner.id, subject: row.subject, learningGoal: row.learningGoal, status: "draft", revisedFromId: row.id,
      }).returning(requestFields);
      if (!draft) throw new Error("Revised Request was not saved.");
      return reply.code(201).send({ courseRequest: draft });
    } catch (error) {
      return fail(reply, request.log, "change-goal", request.params.requestId, error, "Could not create the revised Request.");
    }
  });
}
