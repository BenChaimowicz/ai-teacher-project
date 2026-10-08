import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseTeachingProfileAnswers, resolveTeachingProfile } from "@senoy/db";
import {
  answerQuizItem,
  checkQuizItem,
  getQuiz,
  retakeQuiz,
  revealQuizAnswer,
  submitQuiz,
  type QuizRequest,
} from "../lib/quiz-play.ts";
import { completeLesson, loadStudyCourse, switchSequenceMode } from "../lib/study.ts";
import { drizzleStudyStore, type StudyStore } from "../lib/study-store.ts";

/** Options for Study routes. Tests pass an in-memory store. */
export type StudyRoutesOptions = { store?: StudyStore };

type LessonParams = { courseId: string; lessonId: string };

/**
 * Quiz request for the current Learner, with their current Teaching Profile (show-time fields apply now).
 * @param request - Incoming request
 */
function quizRequest(request: FastifyRequest): QuizRequest {
  const { courseId, lessonId } = request.params as LessonParams;
  const learner = request.currentLearner;
  return {
    learnerId: learner.id,
    courseId,
    lessonId,
    profile: resolveTeachingProfile(parseTeachingProfileAnswers(learner.teachingProfileAnswers)),
  };
}

/**
 * Reads a string field from a JSON body.
 * @param request - Incoming request
 * @param key - Body field
 */
function bodyField(request: FastifyRequest, key: string): unknown {
  const body = request.body;
  return body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
}

/**
 * Sends a service result, or logs and returns 500.
 * @param request - Incoming request
 * @param reply - Fastify reply
 * @param label - What failed, for the log and the Learner
 * @param run - Service call
 */
async function send<T extends { ok: boolean }>(
  request: FastifyRequest,
  reply: FastifyReply,
  label: string,
  run: () => Promise<T>,
) {
  try {
    const result = await run();
    if (!result.ok) {
      const { status, error } = result as unknown as { status: number; error: string };
      return reply.code(status).send({ error });
    }
    const { ok: _ok, ...rest } = result;
    return "payload" in rest ? rest.payload : rest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    request.log.error(
      `[study.ts: studyRoutes] Failed to ${label} || learnerId=${request.currentLearner.id} || url=${request.url} || ${message}`,
    );
    return reply.code(500).send({ error: `Failed to ${label}.` });
  }
}

/**
 * Study payload, Lesson complete, Sequence mode, and Quiz play for a published Course.
 * @param app - Fastify app
 * @param options - Optional store override
 */
export async function studyRoutes(app: FastifyInstance, options: StudyRoutesOptions = {}) {
  const store = options.store ?? drizzleStudyStore(app.db);

  app.get("/api/courses/:courseId", async (request, reply) => {
    try {
      const { courseId } = request.params as { courseId: string };
      const payload = await loadStudyCourse(store, request.currentLearner.id, courseId);
      if (!payload) {
        return reply.code(404).send({ error: "Published Course not found." });
      }
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[study.ts: studyRoutes] Failed to load Study || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load Study." });
    }
  });

  app.post("/api/courses/:courseId/lessons/:lessonId/complete", (request, reply) => {
    const { courseId, lessonId } = request.params as LessonParams;
    return send(request, reply, "complete Lesson", () =>
      completeLesson(store, request.currentLearner.id, courseId, lessonId),
    );
  });

  app.put("/api/courses/:courseId/sequence-mode", (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    return send(request, reply, "change Sequence mode", () =>
      switchSequenceMode(store, request.currentLearner.id, courseId, bodyField(request, "mode")),
    );
  });

  const quiz = "/api/courses/:courseId/lessons/:lessonId/quiz";

  app.get(quiz, (request, reply) => send(request, reply, "load Quiz", () => getQuiz(store, quizRequest(request))));

  app.put(`${quiz}/answers/:itemId`, (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    return send(request, reply, "save answer", () =>
      answerQuizItem(store, quizRequest(request), itemId, bodyField(request, "optionId")),
    );
  });

  app.post(`${quiz}/answers/:itemId/check`, (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    return send(request, reply, "check answer", () => checkQuizItem(store, quizRequest(request), itemId));
  });

  app.post(`${quiz}/answers/:itemId/reveal`, (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    return send(request, reply, "show answer", () => revealQuizAnswer(store, quizRequest(request), itemId));
  });

  app.post(`${quiz}/submit`, (request, reply) =>
    send(request, reply, "submit Quiz", () => submitQuiz(store, quizRequest(request))),
  );

  app.post(`${quiz}/retake`, (request, reply) =>
    send(request, reply, "start retake", () => retakeQuiz(store, quizRequest(request))),
  );
}
