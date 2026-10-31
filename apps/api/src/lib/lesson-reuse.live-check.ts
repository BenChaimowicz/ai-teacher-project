import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { createDb, lessonResearch, loadRootEnv, parseTeachingProfileAnswers, readingProfile, resolveTeachingProfile, type BlueprintSlot } from "@senoy/db";
import { redact, type SourcePack } from "@senoy/research";
import { readingPlugin } from "../teaching-methods/reading.ts";
import { writeTimeProfile } from "./course-generation.ts";
import { createReuseFit, findReuseCandidates, reuseSeed } from "./lesson-reuse.ts";
import { createReadingGenerator, ReuseUnfitError } from "./reading-generation.ts";

/**
 * Exercises Lesson reuse (spec §5.8) on a real published Reading with the real models, writing nothing: looks up the
 * candidates on one subject in the configured database, asks the fit call about a slot that asks for exactly what the
 * first candidate teaches (it should pick it) and about one that asks for something else (it should pick none), then
 * fits the picked Lesson to its slot and runs the reading checks on it. The candidate is treated as written for this
 * Learner's profile, so verbatim is on offer. Makes billable model calls. Not part of `pnpm test`.
 * Optional argument: the subject, as a Course Request typed it.
 */
async function checkLessonReuse() {
  loadRootEnv(import.meta.url, 4);
  const subject = process.argv[2] ?? "Norse mythology";
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const db = createDb(process.env.DATABASE_URL ?? "", { max: 2 });
  try {
    assert.ok(apiKey, "OPENROUTER_API_KEY is not set.");
    const candidates = await findReuseCandidates(db, subject);
    process.stdout.write(`${candidates.length} published Readings on “${subject}” can be reused.\n`);
    const [candidate] = candidates;
    assert.ok(candidate, `No published Reading on “${subject}” has its checkpoint and research stored.`);

    const profile = writeTimeProfile(readingPlugin, resolveTeachingProfile(parseTeachingProfileAnswers({})));
    const reader = readingProfile(profile)!;
    const slot: BlueprintSlot = {
      id: "reuse-check", method: "reading", title: candidate.title, lessonGoal: candidate.lessonGoal,
      objectives: candidate.objectives, topicTags: candidate.topicTags, assessesSlotIds: [],
    };
    const fit = createReuseFit();
    const learningGoal = `Understand ${subject}`;
    const picked = await fit.choose({ learningGoal, scope: null, slot, candidates: [candidate] });
    process.stdout.write(`Same objectives: ${picked.lessonId ? "reuse" : "none"} (${picked.modelId}) — ${picked.reason}\n`);
    const other = await fit.choose({
      learningGoal: "Bake sourdough bread at home", scope: null, candidates: [candidate],
      slot: { ...slot, title: "Feeding a starter", lessonGoal: "Keep a sourdough starter alive.", objectives: ["Feed a sourdough starter on a schedule"] },
    });
    process.stdout.write(`Unrelated objectives: ${other.lessonId ? "reuse" : "none"} — ${other.reason}\n`);

    const [origin] = await db.select({ sourcePacks: lessonResearch.sourcePacks }).from(lessonResearch)
      .where(and(eq(lessonResearch.courseRequestId, candidate.origin.courseRequestId), eq(lessonResearch.slotId, candidate.origin.slotId))).limit(1);
    assert.ok(origin, "The candidate's research row is gone.");
    const startedAt = Date.now();
    let outcome: string;
    try {
      const checked = await createReadingGenerator().generate({
        courseTitle: `${subject}, again`, learningGoal, scope: null, slot, priorLessons: [], profile,
        packs: origin.sourcePacks as SourcePack[],
        reuse: reuseSeed({ ...candidate, writtenFor: profile }, reader),
      });
      outcome = `${checked.lesson.lineage?.mode} · repairs ${checked.repairs} · judge ${checked.judge.pass ? "pass" : "fail"} · ${checked.rounds[0]?.reuse?.reason ?? ""}`;
    } catch (error) {
      if (!(error instanceof ReuseUnfitError)) throw error;
      outcome = `unfit — ${error.reason}`;
      for (const { objective, verdict, reason } of error.grounding) {
        if (verdict !== "supported") process.stdout.write(`  ${verdict}: “${objective}” — ${reason}\n`);
      }
    }
    process.stdout.write(`Fitting “${candidate.title}”: ${outcome} · ${((Date.now() - startedAt) / 1000).toFixed(1)} s\n`);

    assert.equal(picked.lessonId, candidate.lessonId, "The fit call did not pick a Lesson for its own objectives.");
    assert.equal(other.lessonId, null, "The fit call picked a Lesson for objectives it does not teach.");
    assert.doesNotMatch(outcome, /^unfit/, "A Lesson could not be fitted to a slot asking for exactly what it teaches.");
    process.stdout.write("Lesson reuse live check passed.\n");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), apiKey);
    throw new Error(`[lesson-reuse.live-check.ts: checkLessonReuse] Live check failed || subject=${subject} || ${message}`);
  } finally {
    await db.$client.end();
  }
}

await checkLessonReuse();
