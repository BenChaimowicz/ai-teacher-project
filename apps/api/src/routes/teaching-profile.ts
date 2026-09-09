import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  learners,
  parseTeachingProfileAnswers,
  resolveTeachingProfile,
  TEACHING_PROFILE_VERSION,
} from "@senoy/db";

/**
 * GET/PUT/DELETE the current Learner's Teaching Profile.
 * @param app - Fastify app
 */
export async function teachingProfileRoutes(app: FastifyInstance) {
  app.get("/api/teaching-profile", async (request, reply) => {
    try {
      const learner = request.currentLearner;
      const present = learner.teachingProfileVersion === TEACHING_PROFILE_VERSION && learner.teachingProfileAnswers != null;
      if (!present) {
        return {
          present: false,
          version: null,
          assessedAt: null,
          updatedAt: null,
          answers: null,
          resolved: null,
        };
      }
      const answers = parseTeachingProfileAnswers(learner.teachingProfileAnswers);
      return {
        present: true,
        version: TEACHING_PROFILE_VERSION,
        assessedAt: learner.teachingProfileAssessedAt?.toISOString() ?? null,
        updatedAt: learner.teachingProfileUpdatedAt?.toISOString() ?? null,
        answers,
        resolved: resolveTeachingProfile(answers),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[teaching-profile.ts: teachingProfileRoutes] Failed to load Teaching Profile || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load Teaching Profile." });
    }
  });

  app.put("/api/teaching-profile", async (request, reply) => {
    try {
      const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
      const action = body.action === "reassess" ? "reassess" : "save";
      const answers = parseTeachingProfileAnswers(body.answers);
      const now = new Date();
      const wasPresent =
        request.currentLearner.teachingProfileVersion === TEACHING_PROFILE_VERSION &&
        request.currentLearner.teachingProfileAnswers != null;

      const assessedAt = !wasPresent || action === "reassess" ? now : request.currentLearner.teachingProfileAssessedAt ?? now;

      const [row] = await app.db
        .update(learners)
        .set({
          teachingProfileVersion: TEACHING_PROFILE_VERSION,
          teachingProfileAnswers: answers,
          teachingProfileAssessedAt: assessedAt,
          teachingProfileUpdatedAt: now,
        })
        .where(eq(learners.id, request.currentLearner.id))
        .returning();

      if (!row) {
        return reply.code(500).send({ error: "Failed to save Teaching Profile." });
      }

      return {
        present: true,
        version: TEACHING_PROFILE_VERSION,
        assessedAt: row.teachingProfileAssessedAt?.toISOString() ?? now.toISOString(),
        updatedAt: row.teachingProfileUpdatedAt?.toISOString() ?? now.toISOString(),
        answers,
        resolved: resolveTeachingProfile(answers),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[teaching-profile.ts: teachingProfileRoutes] Failed to save Teaching Profile || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to save Teaching Profile." });
    }
  });

  app.delete("/api/teaching-profile", async (request, reply) => {
    try {
      const [row] = await app.db
        .update(learners)
        .set({
          teachingProfileVersion: null,
          teachingProfileAnswers: null,
          teachingProfileAssessedAt: null,
          teachingProfileUpdatedAt: null,
        })
        .where(eq(learners.id, request.currentLearner.id))
        .returning();

      if (!row) {
        return reply.code(500).send({ error: "Failed to reset Teaching Profile." });
      }

      return {
        present: false,
        version: null,
        assessedAt: null,
        updatedAt: null,
        answers: null,
        resolved: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[teaching-profile.ts: teachingProfileRoutes] Failed to reset Teaching Profile || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to reset Teaching Profile." });
    }
  });
}
