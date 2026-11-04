import { and, desc, eq } from "drizzle-orm";
import { blueprintChapters, blueprintSlots, chapterKey, type ApprovedBlueprint, type BlueprintChapter, type BlueprintSlot, type JudgeResult } from "@senoy/db/blueprint";
import type { GoalScope, ResearchTier } from "@senoy/db/course-request";
import {
  GOAL_CHECK_METHOD_ID,
  courseBlueprints,
  courseCodeFailures,
  courseRequests,
  learners,
  lessonResearch,
  publicationRows,
  publishedCourses,
  publishedLessons,
  publishedModules,
  readingProfile,
  resolveTeachingProfile,
  retrievable,
  startingLevelDiagnostics,
  unpublishedLessons,
  type Database,
  type ReadingBody,
  type ResolvedTeachingProfile,
  type ReuseCandidate,
  type Transaction,
} from "@senoy/db";
import { researchAdaptersForTier, runResearch, type SourcePack } from "@senoy/research";
import { quizPlugin } from "../teaching-methods/quiz.ts";
import { readingPlugin } from "../teaching-methods/reading.ts";
import type { TeachingMethodPlugin } from "../teaching-methods/types.ts";
import { courseOutline, createCourseJudge, type CourseJudge } from "./course-judge.ts";
import { enqueueJob, LeaseLostError, type GenerationControl, type SettledStatus, type WorkerIdentity } from "./generation-job.ts";
import { createMediaStorage, mediaStorageConfigFromEnv, type MediaStorage } from "@senoy/media";
import { findVisualOnCommons } from "./commons-ingest.ts";
import { WIKIMEDIA_CONTACT_ENV } from "./commons.ts";
import { createIllustrator } from "./illustrator.ts";
import { createReuseFit, findReuseCandidates, reuseSeed, type FindReuseCandidates, type ReuseFit } from "./lesson-reuse.ts";
import { createMediaLibrary } from "./media-library.ts";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts } from "./model-ports.ts";
import { createGoalCheckGenerator, GoalCheckFailedError, type CheckedGoalCheck, type GoalCheckGenerator } from "./goal-check-generation.ts";
import { createQuizGenerator, QuizFailedError, type CheckedQuiz, type QuizGenerator } from "./quiz-generation.ts";
import {
  createReadingGenerator,
  lessonEvidence,
  LessonUnresearchableError,
  ReadingFailedError,
  ReuseUnfitError,
  type CheckedReading,
  type ReadingGeneratorOptions,
  type PriorLesson,
  type ReadingGenerator,
  type ChapterDraft,
} from "./reading-generation.ts";
import { createResearchTierRater, type ResearchTierRater } from "./research-tier.ts";
import type { StructuredTransport } from "./openrouter.ts";
import { createTrackedTransport, trackResearchRun, withPipelineEvent, type PipelineEventScope } from "./usage-tracking.ts";
import { createVisualJudge } from "./visual-judge.ts";

/** What one run of a claimed generation job receives. */
export type GenerationStart = {
  db: Database;
  courseRequestId: string;
  learnerId: string;
  approved: ApprovedBlueprint;
  control: GenerationControl;
  /** The worker running the job, recorded on the `course_generation` Pipeline Event. */
  worker?: WorkerIdentity;
};

/** Full-Course generation for an approved Blueprint, through atomic publish; the worker runs it as a durable job (spec §5.1). */
export interface CourseGeneration {
  start(input: GenerationStart): Promise<void>;
}

/** Primary and Secondary research for one Lesson topic, on the Course's research tier. */
export type LessonResearch = (topic: string) => Promise<SourcePack[]>;

/** Primary and Secondary research for one Lesson topic on a given research tier (spec §5.3). */
export type TieredResearch = (topic: string, tier: ResearchTier) => Promise<SourcePack[]>;

/**
 * Injectable research, research-tier rater, reuse lookup and fit, Generators, and whole-Course Judge; omitted ones are
 * created lazily from the environment, and the reuse lookup reads the run's database.
 */
export type CourseGenerationOptions = {
  research?: TieredResearch;
  researchTierRater?: ResearchTierRater;
  findReuseCandidates?: FindReuseCandidates;
  reuseFit?: ReuseFit;
  readingGenerator?: ReadingGenerator;
  quizGenerator?: QuizGenerator;
  goalCheckGenerator?: GoalCheckGenerator;
  courseJudge?: CourseJudge;
};

/** The assembled Course failed the whole-Course checks (spec §6.5); nothing was published. */
export class CourseFailedError extends Error {
  /**
   * @param codeFailures - Whole-Course Code check problems; empty when only the Judge failed
   * @param judge - Whole-Course Judge verdict, when the Judge ran
   */
  constructor(public readonly codeFailures: string[], public readonly judge: JudgeResult | null) {
    const reasons = codeFailures.length ? codeFailures : [...(judge?.failedChecks ?? []), ...(judge?.reasons ?? [])];
    super(`[course-generation: publish] Course failed whole-Course ${codeFailures.length ? "Code" : "Judge"} checks || ${reasons.join(" || ")}`);
    this.name = "CourseFailedError";
  }

  /** The Judge named the sequence, not a Lesson: only a new Blueprint can fix it (spec §6.5), never Retry. */
  get needsNewBlueprint(): boolean {
    return this.judge?.failedChecks.includes("sequence_reaches_goal") ?? false;
  }
}

/** Where generation stopped, so its failure can be told in plain language. */
type Stage = { kind: "research" } | { kind: "lesson"; title: string } | { kind: "course" };

/**
 * The clause promising back the Lessons a Retry keeps, or nothing at all when none were checkpointed: the first Lesson
 * failing keeps no Lessons, so the failure must not say it does (SEN-95).
 * @param written - How many Lessons are checkpointed for the Course Request
 */
function keptClause(written: number): string {
  if (written === 0) return "";
  return `, keeping the ${written === 1 ? "Lesson" : `${written} Lessons`} already written`;
}

/** What the Learner can do after an interruption: for a transient failure, Retry is Resume (spec §5.1). */
const RESUME_STEP = "Retry continues from the next unfinished Lesson.";

/**
 * Whether generation stopped on a failed check rather than an interruption (a provider error, timeout, or crash).
 * Both are retried; a failed check is terminal until the Learner does (spec §5.1).
 * @param error - What stopped generation
 */
export function failedCheck(error: unknown): boolean {
  return error instanceof ReadingFailedError || error instanceof QuizFailedError || error instanceof GoalCheckFailedError ||
    error instanceof CourseFailedError || error instanceof LessonUnresearchableError;
}

/**
 * The Learner-facing reason generation stopped. A failed check is said plainly; anything else is an interruption.
 * @param stage - Where generation stopped
 * @param error - What stopped it
 * @param written - How many Lessons are checkpointed, so a Retry only promises back Lessons there are (SEN-95)
 */
export function failureReason(stage: Stage, error: unknown, written: number): string {
  if (stage.kind === "research") return `Generation was interrupted while researching your Lessons. ${RESUME_STEP}`;
  if (stage.kind === "lesson") {
    if (error instanceof LessonUnresearchableError) {
      return `We couldn't find reliable Sources for the Lesson “${stage.title}”. Retry searches for it again${keptClause(written)}.`;
    }
    const retryStep = written === 0 ? "Retry tries that Lesson again." : `Retry tries again from there${keptClause(written)}.`;
    return failedCheck(error)
      ? `We couldn't write the Lesson “${stage.title}” so that it passed our quality checks. ${retryStep}`
      : `Generation was interrupted while writing the Lesson “${stage.title}”. ${RESUME_STEP}`;
  }
  if (error instanceof CourseFailedError && error.needsNewBlueprint) {
    return "Together, the finished Lessons don't reach your Learning Goal, so this Course can't be published, and writing them again wouldn't change that — the plan has to change. We're planning it again now; the lessons written under the old plan are gone.";
  }
  return failedCheck(error)
    ? `The finished Lessons didn't fit together well enough to publish as one Course. Retry checks them again.`
    : `Generation was interrupted while publishing your Course. ${RESUME_STEP}`;
}

/**
 * How the job ends when generation stops: a sequence that misses the goal is final, a failed check waits for Retry, and
 * anything else is an interruption that Retry resumes.
 * @param error - What stopped generation
 */
export function settledStatus(error: unknown): SettledStatus {
  if (error instanceof CourseFailedError && error.needsNewBlueprint) return "needs_new_blueprint";
  return failedCheck(error) ? "failed" : "interrupted";
}

/**
 * The research topic for one slot: research is scoped per Lesson (spec §5.2). With a Learner-confirmed scope (SEN-90),
 * a short clause names its in- and out-of-scope facets so vendors search inside it; without one, the topic is unchanged.
 * @param subject - The Course Request subject
 * @param slot - The Blueprint slot
 * @param scope - The Learner-confirmed focus of the Learning Goal, or null (SEN-90)
 */
export function lessonResearchTopic(subject: string, slot: BlueprintSlot, scope: GoalScope | null): string {
  const topic = `${slot.title} (${subject}). ${slot.lessonGoal} Covers: ${slot.objectives.join("; ")}.`;
  const focus = scope?.inScope.length ? ` Focus: ${scope.inScope.join("; ")}.` : "";
  const not = scope?.outOfScope.length ? ` Not: ${scope.outOfScope.join("; ")}.` : "";
  return `${topic}${focus}${not}`;
}

/**
 * The queries one Reading slot is searched with, in order, until something usable comes back: an empty Source pack
 * means hard to research, so it is retried with broader queries before the Course can fail for it (spec §5.9, SEN-85).
 * Broadening is by deletion, not rephrasing: the scoped topic, then the same topic without its objective list and
 * out-of-scope clause, then the bare title and subject. No model writes these, so a re-search costs only vendor calls.
 * @param subject - The Course Request subject
 * @param slot - The Blueprint slot
 * @param scope - The Learner-confirmed focus of the Learning Goal, or null (SEN-90)
 */
export function researchQueries(subject: string, slot: BlueprintSlot, scope: GoalScope | null): string[] {
  const focus = scope?.inScope.length ? ` Focus: ${scope.inScope.join("; ")}.` : "";
  return [
    lessonResearchTopic(subject, slot, scope),
    `${slot.title} (${subject}). ${slot.lessonGoal}${focus}`,
    `${slot.title} (${subject})`,
  ];
}

/**
 * The slot a Chapter is researched as (decision 2026-11-03): its title, with every Lesson goal and objective of the
 * Readings still to research, so one search serves them all. A Chapter of one Reading is researched exactly as that
 * Reading was before Chapters existed.
 * @param chapter - The Chapter, holding only the Readings still to research
 */
export function chapterResearchSlot(chapter: BlueprintChapter): BlueprintSlot {
  const [first] = chapter.slots;
  if (!first) throw new Error(`[course-generation: chapterResearchSlot] A Chapter has no Readings || chapter=${chapter.title}`);
  return {
    ...first,
    title: chapter.title,
    lessonGoal: chapter.slots.map((slot) => slot.lessonGoal).join(" "),
    objectives: [...new Set(chapter.slots.flatMap((slot) => slot.objectives))],
    topicTags: [...new Set(chapter.slots.flatMap((slot) => slot.topicTags))],
  };
}

/** A vendor that timed out or failed said nothing about the topic: not evidence that it is hard to research (spec §5.9). */
function unfinished(pack: SourcePack): boolean {
  return pack.status === "timed_out" || pack.status === "error";
}

/** How the search for one Reading's evidence ended. */
export type SlotSearch = {
  /** Packs of the last query tried: the one that found evidence, or the one the search gave up on. */
  packs: SourcePack[];
  /** Queries tried, in order. */
  queries: string[];
  /** True when a vendor never answered, so there is nothing to conclude about the topic and Retry should search again. */
  interrupted: boolean;
};

/**
 * Searches one Reading's topic with broader queries until a pack has something to cite (spec §5.9). Stops early when
 * a vendor times out or fails: a call that never answered says nothing about how researchable the topic is, so
 * broadening the query would be answering the wrong question, and the Course is interrupted rather than failed.
 * @param research - The research call
 * @param queries - The queries to try, broadest last
 */
export async function searchForEvidence(research: LessonResearch, queries: string[]): Promise<SlotSearch> {
  let packs: SourcePack[] = [];
  for (const [attempt, query] of queries.entries()) {
    packs = await research(query);
    const tried = queries.slice(0, attempt + 1);
    if (lessonEvidence(packs).size > 0) return { packs, queries: tried, interrupted: false };
    if (packs.some(unfinished)) return { packs, queries: tried, interrupted: true };
  }
  return { packs, queries, interrupted: false };
}

/**
 * Only the write-time Teaching Profile values a plugin declared (spec §5.5).
 * @param plugin - The slot's Teaching-method plugin
 * @param profile - The Learner's resolved Teaching Profile
 */
export function writeTimeProfile(plugin: TeachingMethodPlugin, profile: ResolvedTeachingProfile): Record<string, unknown> {
  return Object.fromEntries(plugin.writeTimeFields.map((field) => [field, profile[field].value]));
}

/**
 * Research run against the tier's two vendors with keys from the environment; each vendor call becomes a Usage Record,
 * measured against the vendor balance when the meter is on. Once `signal` aborts, calls in flight stop and the search
 * throws its reason instead of returning packs it never finished (SEN-93).
 * @param signal - The run's `GenerationControl.signal`
 */
function researchUntil(signal: AbortSignal): TieredResearch {
  /** fetch that also stops when the run loses its job. */
  const fetch: typeof globalThis.fetch = (input, init) =>
    globalThis.fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal });
  return async (topic, tier) => {
    signal.throwIfAborted();
    const packs = await runResearch(topic, { ...researchAdaptersForTier(tier), env: process.env, fetch, ...trackResearchRun() });
    signal.throwIfAborted();
    return packs;
  };
}

/**
 * Rates a Request's focused Learning Goal under its own `research_tier` Pipeline Event and stores the tier and the
 * rating on the Request in one write, so a resumed or retried run reuses them (spec §5.3, SEN-124). A failed rating
 * still stores a tier (deluxe under `auto`) with a null rating.
 * @param input.request - The Course Request, with no research tier yet
 * @param input.rater - Picks the tier
 * @param input.holding - Runs the write only while the run still holds its job
 * @returns The tier every research call of the Course uses
 */
async function chooseResearchTier({ request, rater, holding }: {
  request: Pick<typeof courseRequests.$inferSelect, "id" | "subject" | "learningGoal" | "focus">;
  rater: ResearchTierRater;
  holding: (write: (transaction: Transaction) => Promise<unknown>) => Promise<void>;
}): Promise<ResearchTier> {
  const choice = await withPipelineEvent("research_tier", { label: request.learningGoal }, async (step) => {
    const chosen = await rater.choose({ subject: request.subject, learningGoal: request.learningGoal, scope: request.focus?.scope ?? null });
    step.setDetail({ tier: chosen.tier, rating: chosen.rating, mode: chosen.mode, ...(chosen.error ? { error: chosen.error } : {}) });
    return chosen;
  });
  await holding((transaction) => transaction.update(courseRequests)
    .set({ researchTier: choice.tier, researchTierRating: choice.rating })
    .where(eq(courseRequests.id, request.id)).returning({ id: courseRequests.id }));
  return choice.tier;
}

/**
 * Whether Readings get images: `READING_MEDIA` is `on` (default) or `off`. Off leaves the media library out, so no
 * visual is briefed or shown; test runs use it while media is still being designed (decision 2026-11-02).
 * @param env - Usually `process.env`
 * @throws Error for any other value
 */
export function readingMediaFromEnv(env: Record<string, string | undefined>): "on" | "off" {
  const value = env.READING_MEDIA?.trim().toLowerCase() || "on";
  if (value !== "on" && value !== "off") {
    throw new Error(`[course-generation.ts: readingMediaFromEnv] Unknown reading media setting || READING_MEDIA=${env.READING_MEDIA} || known=on,off`);
  }
  return value;
}

/**
 * The private bucket, opened on first use, so a run that never stores or reads a file never needs the bucket keys.
 */
function lazyMediaStorage(): MediaStorage {
  let bucket: MediaStorage | null = null;
  const open = () => (bucket ??= createMediaStorage(mediaStorageConfigFromEnv()));
  return {
    put: (key, body, contentType) => open().put(key, body, contentType),
    head: (key) => open().head(key),
    get: (key) => open().get(key),
  };
}

/**
 * Everything a run's Readings get their visuals from (SEN-121, decision 2026-11-03): the library over the bucket, the
 * illustrator that draws depictions and diagrams into the same bucket, and the Commons search when `WIKIMEDIA_CONTACT`
 * names a contact for its User-Agent (SEN-129); without one, Commons is left out and the library is the last source.
 * Every Judge call goes through one Vision Judge over the run's transport, and the Commons search's librarian (SEN-132)
 * runs on the triage model over the same transport, so both stop with the run.
 * @param db - Database, for the library and the Commons ingest
 * @param transport - The run's tracked transport
 * @param env - Usually `process.env`
 */
function visualSources(db: Database, transport: StructuredTransport, env: NodeJS.ProcessEnv = process.env): Pick<ReadingGeneratorOptions, "media" | "illustrator" | "commons" | "judgeVisual"> {
  const storage = lazyMediaStorage();
  const judgeVisual = createVisualJudge({ transport });
  const triage = createModelPorts({ transport }).triage;
  const commons: ReadingGeneratorOptions["commons"] = (brief, judge) => findVisualOnCommons({ brief, judge, db, storage, triage });
  return {
    media: createMediaLibrary(db, storage),
    judgeVisual,
    illustrator: createIllustrator({ storage, judgeVisual, transport }),
    ...(env[WIKIMEDIA_CONTACT_ENV]?.trim() ? { commons } : {}),
  };
}

/**
 * First decides, for each Reading slot, whether it reuses a published Lesson (spec §5.8): published Readings on the
 * same subject that share a Topic tag are retrieved, and one fit call per slot with candidates judges them on
 * objectives. A slot that reuses one gets a copy of that Lesson's Source packs and is never researched.
 *
 * Researches every other Reading slot at once and stores each slot's Source packs as it finishes, so one slow research
 * call no longer delays every Reading in turn. Then writes each Lesson in Blueprint order, carrying earlier Readings forward:
 * a Reading from its stored packs, a Quiz from its checkpointed Readings (spec §5.2.4), and the closing Goal Check from
 * the Learning Goal and every checkpointed Reading its goal objectives name (SEN-81), saving each as an unpublished
 * checkpoint. A reused Reading is fitted to its slot, verbatim or adapted, and passes the same checks against the packs
 * it was written from; one that cannot be made to fit is researched there and then and written like any other.
 * Then the whole-Course Code checks and one Judge pass over the outline (spec §6.5), and atomic publish:
 * the Course snapshot, the `published` status, and the job's success in one transaction.
 *
 * Before anything else, a Request with no research tier is rated under its own `research_tier` Pipeline Event and its
 * tier and rating are stored on the Request in one write (spec §5.3, SEN-124); every research call of the Course then
 * uses that tier's adapter pair, and a resumed or retried run reuses the stored tier and never rates again.
 *
 * A slot that already has stored research is not researched again, and one that has a checkpoint is not generated
 * again, so a resumed or reclaimed job continues from the next unfinished Lesson; earlier Readings reach later ones
 * from their checkpoints. Every write first proves the run still holds its job, so after Cancel or a lapsed lease the
 * run saves nothing; and its model and research calls stop as soon as the worker learns of the loss, so it does not
 * keep paying until its stage ends (SEN-93).
 *
 * Any failure publishes nothing and keeps the checkpoints. A failed check fails the job and an interruption leaves it
 * `interrupted`; either moves the Request to `generation_failed` with a plain-language reason, and Retry queues the
 * job again (spec §5.1). Packs with nothing to cite are never stored, and vetting that empties a Reading's evidence
 * discards its stored packs, so either way Retry searches for that Reading again.
 * Targeted repair of a Lesson the whole-Course Judge names is not built; Retry judges the Course again.
 *
 * A sequence that misses the goal is the one failure Retry cannot help, so the run makes the structural return itself
 * (spec §5.1, SEN-85): the job ends `needs_new_blueprint`, every unpublished Lesson and stored pack of the failed plan
 * is discarded, the approved snapshot is cleared with the Judge's reasons left on the draft, and the Request goes to
 * `blueprint_preparing` with a queued Blueprint job — so the Learner comes back to a new plan to review, not a dead end.
 * @param options - Injected research, research-tier rater, reuse lookup and fit, Generators, and Judge; tests pass fixtures
 */
export function createCourseGeneration(options: CourseGenerationOptions = {}): CourseGeneration {
  return {
    start({ db, courseRequestId, learnerId, approved, control, worker }) {
      return withPipelineEvent("course_generation", {
        label: approved.blueprint.courseTitle, courseRequestId, learnerId, detail: worker ? { worker } : undefined,
      }, (event) => run({ db, courseRequestId, learnerId, approved, control }, event));
    },
  };

  /**
   * One run of the job, inside its `course_generation` Pipeline Event.
   * @param input - The claimed job
   * @param event - The run's Pipeline Event, for its detail
   */
  async function run({ db, courseRequestId, learnerId, approved, control }: GenerationStart, event: PipelineEventScope): Promise<void> {
    let stage: Stage = { kind: "course" };
    try {
      const [request] = await db.select().from(courseRequests).where(eq(courseRequests.id, courseRequestId)).limit(1);
      const [learner] = await db.select().from(learners).where(eq(learners.id, learnerId)).limit(1);
      if (!request || !learner?.teachingProfileAnswers) {
        throw new Error(`[course-generation: start] Request or Teaching Profile is missing || requestId=${courseRequestId}`);
      }
      const resolved = resolveTeachingProfile(learner.teachingProfileAnswers);
      const profile = writeTimeProfile(readingPlugin, resolved);
      const readerProfile = readingProfile(profile)!;
      const scope = request.focus?.scope ?? null;
      // What the Learner typed in their own words while focusing the goal (decision 2026-11-03), for the Readings to speak to.
      const learnerAsked = (request.focus?.rounds ?? [])
        .flatMap((round) => round.answers ?? [])
        .filter((answer) => answer.ownWords)
        .map((answer) => answer.answer.trim())
        .filter(Boolean)
        .join(" ");
      // Readings are written for where this Learner starts (SEN-48); publish needs it too, and checks it is there.
      const [diagnostic] = await db.select({ startingLevel: startingLevelDiagnostics.startingLevel }).from(startingLevelDiagnostics)
        .where(eq(startingLevelDiagnostics.courseRequestId, courseRequestId))
        .orderBy(desc(startingLevelDiagnostics.createdAt)).limit(1);
      // Every model and research call of this run stops the moment the worker learns it lost the job (SEN-93).
      const transport = createTrackedTransport({ signal: control.signal });
      /** Runs one write only while this run still holds the job. */
      const holding = (write: (transaction: Transaction) => Promise<unknown>) => db.transaction(async (transaction) => {
        await control.hold(transaction);
        await write(transaction);
      });
      const tier = request.researchTier ?? await chooseResearchTier({
        request, rater: options.researchTierRater ?? createResearchTierRater({ triage: createModelPorts({ transport }).triage }), holding,
      });
      event.setDetail({ researchTier: tier });
      const tieredResearch = options.research ?? researchUntil(control.signal);
      /** Every research call of this Course runs on its stored tier. */
      const research: LessonResearch = (topic) => tieredResearch(topic, tier);
      const generator = options.readingGenerator ?? createReadingGenerator({ transport, ...(readingMediaFromEnv(process.env) === "on" ? visualSources(db, transport) : {}) });
      const reuseFit = options.reuseFit ?? createReuseFit({ transport });
      const findCandidates = options.findReuseCandidates ?? ((subject: string) => findReuseCandidates(db, subject));
      let pool: Promise<ReuseCandidate[]> | null = null;
      /** Every published Reading on this subject, looked up once per run and only when a slot needs it. */
      const reusePool = () => (pool ??= findCandidates(request.subject));
      const priorLessons: PriorLesson[] = [];
      const finished = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
      const finishedSlotIds = new Set(finished.map((row) => row.slotId));
      const slots = blueprintSlots(approved.blueprint);
      event.setDetail({ slots: slots.length, alreadyWritten: finishedSlotIds.size });

      const stored = await db.select().from(lessonResearch).where(eq(lessonResearch.courseRequestId, courseRequestId));
      const packsBySlot = new Map(stored.map((row) => [row.slotId, row.sourcePacks as SourcePack[]]));
      /** Slots whose stored packs are a copy of the published Lesson they reuse, by that Lesson's id. */
      const reusedBySlot = new Map(stored.flatMap((row) => row.reusedLessonId ? [[row.slotId, row.reusedLessonId] as const] : []));
      const unresearched = slots.filter((slot) => slot.method === readingPlugin.id && !finishedSlotIds.has(slot.id) && !packsBySlot.has(slot.id));

      /**
       * Searches one Reading's evidence under its own `research` Pipeline Event.
       * @param slot - The Reading slot
       */
      const researchSlot = (slot: BlueprintSlot) => withPipelineEvent("research", { label: slot.title, detail: { slotId: slot.id } }, async (step) => {
        const found = await searchForEvidence(research, researchQueries(request.subject, slot, scope));
        step.setDetail({
          queries: found.queries, interrupted: found.interrupted,
          packs: found.packs.map((pack) => ({ adapter: pack.adapter, status: pack.status, sources: pack.sources.length })),
        });
        return found;
      });

      /**
       * Searches one Chapter's evidence under its own `research` Pipeline Event, as the one slot its Readings add up to
       * (decision 2026-11-03).
       * @param chapter - The Chapter, holding only the Readings still to research
       */
      const researchChapter = (chapter: BlueprintChapter) => withPipelineEvent("research", {
        label: chapter.title, detail: { chapter: chapter.title, slotIds: chapter.slots.map((slot) => slot.id) },
      }, async (step) => {
        const found = await searchForEvidence(research, researchQueries(request.subject, chapterResearchSlot(chapter), scope));
        step.setDetail({
          queries: found.queries, interrupted: found.interrupted,
          packs: found.packs.map((pack) => ({ adapter: pack.adapter, status: pack.status, sources: pack.sources.length })),
        });
        return found;
      });

      /**
       * Decides, before any research, which open Reading slots reuse a published Lesson (spec §5.8): candidates on this
       * subject that share a Topic tag, in this Learner's language and no shorter than their contentScope, go to one fit
       * call per slot. A pick copies that Lesson's Source packs into the slot's research row, so the slot is never
       * researched. Slots are decided in Blueprint order and no Lesson is reused twice in one Course. With no candidates,
       * no call is made.
       * @param open - Reading slots with no checkpoint and no research yet
       */
      async function chooseReuse(open: BlueprintSlot[]): Promise<void> {
        const candidates = await reusePool();
        if (candidates.length === 0) return;
        const taken = new Set(reusedBySlot.values());
        for (const slot of open) {
          const retrieved = candidates.filter((candidate) => !taken.has(candidate.lessonId) && retrievable(slot, candidate, readerProfile));
          if (retrieved.length === 0) continue;
          const choice = await withPipelineEvent("reuse", { label: slot.title, detail: { slotId: slot.id } }, async (step) => {
            const chosen = await reuseFit.choose({ learningGoal: request.learningGoal, scope, slot, candidates: retrieved });
            step.setDetail({
              slotId: slot.id, candidates: retrieved.map(({ lessonId, title }) => ({ lessonId, title })),
              chosen: chosen.lessonId, reason: chosen.reason, modelId: chosen.modelId,
            });
            return chosen;
          });
          const picked = retrieved.find((candidate) => candidate.lessonId === choice.lessonId);
          if (!picked) continue;
          const [origin] = await db.select({ sourcePacks: lessonResearch.sourcePacks }).from(lessonResearch)
            .where(and(eq(lessonResearch.courseRequestId, picked.origin.courseRequestId), eq(lessonResearch.slotId, picked.origin.slotId))).limit(1);
          if (!origin) continue;
          await holding((transaction) => transaction.insert(lessonResearch).values({
            courseRequestId, slotId: slot.id, sourcePacks: origin.sourcePacks, reusedLessonId: picked.lessonId,
          }));
          packsBySlot.set(slot.id, origin.sourcePacks as SourcePack[]);
          reusedBySlot.set(slot.id, picked.lessonId);
          taken.add(picked.lessonId);
        }
      }

      /** Slots whose whole query ladder came back with nothing to cite, and whether a vendor simply never answered. */
      const empty = new Map<string, boolean>();
      if (unresearched.length) {
        stage = { kind: "research" };
        await control.progress("research", null);
        // Reuse is decided on objectives before research, so a slot that reuses a Lesson is never researched (spec §5.8).
        await chooseReuse(unresearched);
        // Every call runs to the end, even after one fails, so each finished slot is stored and Resume skips it.
        // One search per Chapter (decision 2026-11-03): its Readings share the packs, each stored in its own row so a
        // Retry resumes slot by slot as before. A Reading that reuses a Lesson already has its packs and is left out.
        const open = new Set(unresearched.filter((slot) => !packsBySlot.has(slot.id)).map((slot) => slot.id));
        const chapters = blueprintChapters(approved.blueprint)
          .map((chapter) => ({ ...chapter, slots: chapter.slots.filter((slot) => open.has(slot.id)) }))
          .filter((chapter) => chapter.slots.length > 0);
        const outcomes = await Promise.allSettled(chapters.map(async (chapter) => {
          const search = await researchChapter(chapter);
          // Packs with nothing to cite are not stored, so a Retry searches again instead of resuming from them.
          if (lessonEvidence(search.packs).size === 0) {
            for (const slot of chapter.slots) empty.set(slot.id, search.interrupted);
            return;
          }
          for (const slot of chapter.slots) {
            await holding((transaction) => transaction.insert(lessonResearch).values({ courseRequestId, slotId: slot.id, sourcePacks: search.packs }));
            packsBySlot.set(slot.id, search.packs);
          }
        }));
        const failed = outcomes.find((outcome) => outcome.status === "rejected");
        if (failed) {
          const lost = outcomes.find((outcome) => outcome.status === "rejected" && outcome.reason instanceof LeaseLostError);
          throw ((lost ?? failed) as PromiseRejectedResult).reason;
        }
      }
      // A Reading with nothing to ground it fails the Course before any more is written (spec §5.9).
      const unresearchable = slots.find((slot) => slot.method === readingPlugin.id && !finishedSlotIds.has(slot.id) &&
        lessonEvidence(packsBySlot.get(slot.id) ?? []).size === 0);
      if (unresearchable) {
        // A vendor that never answered leaves the topic unjudged: that is an interruption Retry searches again, not a
        // Lesson we can say is hard to research (spec §5.9, SEN-85).
        if (empty.get(unresearchable.id)) {
          throw new Error(`[course-generation: research] Research did not finish for this Reading || slotId=${unresearchable.id}`);
        }
        stage = { kind: "lesson", title: unresearchable.title };
        throw new LessonUnresearchableError(unresearchable.id);
      }

      /** Chapter drafts by slot id: a Lesson drafted with its Chapter is finished from that draft, never written again. */
      const chapterDrafts = new Map<string, ChapterDraft>();

      /**
       * When the Reading at `position` opens a run of two or more Lessons of one Chapter still to write, drafts them all
       * in one author call under a `chapter` Pipeline Event (decision 2026-11-03), so short Lessons cost what long ones
       * did. A reused Lesson is fitted on its own and ends the run; a single remaining Lesson is written on its own, as
       * before; a generator without `draftChapter` (a fixture) writes every Lesson on its own.
       * @param position - The Reading's place in the Blueprint
       */
      async function draftChapterFrom(position: number): Promise<void> {
        const slot = slots[position]!;
        if (!generator.draftChapter || chapterDrafts.has(slot.id) || reusedBySlot.has(slot.id)) return;
        const key = chapterKey(slot);
        const run: BlueprintSlot[] = [];
        for (const next of slots.slice(position)) {
          if (next.method !== readingPlugin.id || chapterKey(next) !== key || finishedSlotIds.has(next.id) || reusedBySlot.has(next.id)) break;
          run.push(next);
        }
        if (run.length < 2) return;
        const packs = packsBySlot.get(slot.id);
        if (!packs) throw new Error(`[course-generation: chapter] Chapter has no stored research || slotId=${slot.id}`);
        const chapter = slot.chapter?.trim() || slot.title;
        const draft = await withPipelineEvent("chapter", { label: chapter, detail: { chapter, slotIds: run.map(({ id }) => id) } }, async (step) => {
          const drafted = await generator.draftChapter!({
            courseTitle: approved.blueprint.courseTitle,
            learningGoal: request.learningGoal,
            scope,
            ...(learnerAsked ? { learnerAsked } : {}),
            chapter,
            slots: run,
            priorLessons: [...priorLessons],
            profile,
            ...(diagnostic?.startingLevel ? { startingLevel: diagnostic.startingLevel } : {}),
            packs,
          });
          step.setDetail({ modelId: drafted.modelId, rejectedSources: drafted.rejectedSources.length, lessons: drafted.lessons });
          return drafted;
        });
        for (const member of run) chapterDrafts.set(member.id, draft);
      }

      /**
       * Writes one Reading from its stored packs under its own `reading` Pipeline Event, fitting the published Lesson it
       * reuses when it has one.
       * @param slot - The Reading slot
       * @param position - Its place in the Blueprint
       * @throws ReuseUnfitError when its reused Lesson cannot be made to fit
       */
      async function writeReading(slot: BlueprintSlot, position: number): Promise<CheckedReading> {
        const packs = packsBySlot.get(slot.id);
        if (!packs) throw new Error(`[course-generation: lesson] Reading slot has no stored research || slotId=${slot.id}`);
        const reusedLessonId = reusedBySlot.get(slot.id);
        return withPipelineEvent("reading", {
          label: slot.title, detail: { slotId: slot.id, position, ...(reusedLessonId ? { reusedLessonId } : {}) },
        }, async (step) => {
          let checked: CheckedReading;
          try {
            const reused = reusedLessonId ? (await reusePool()).find((candidate) => candidate.lessonId === reusedLessonId) : undefined;
            if (reusedLessonId && !reused) throw new ReuseUnfitError(slot.id, "The reused Lesson is no longer a reuse candidate.");
            // A Lesson drafted with its Chapter is finished from that draft; any other is written here on its own.
            const chapterDraft = chapterDrafts.get(slot.id);
            checked = chapterDraft ? await chapterDraft.finish(slot.id, [...priorLessons]) : await generator.generate({
              courseTitle: approved.blueprint.courseTitle,
              learningGoal: request.learningGoal,
              scope,
              ...(learnerAsked ? { learnerAsked } : {}),
              slot,
              priorLessons: [...priorLessons],
              profile,
              ...(diagnostic?.startingLevel ? { startingLevel: diagnostic.startingLevel } : {}),
              packs,
              ...(reused ? { reuse: reuseSeed(reused, readerProfile) } : {}),
            });
          } catch (error) {
            // Rejected drafts are saved nowhere else, so the event keeps every draft, edit, and verdict, pass or fail.
            if (error instanceof ReadingFailedError) {
              step.setDetail({ grounding: error.grounding, rejectedSources: error.rejectedSources, rounds: error.rounds });
            }
            if (error instanceof ReuseUnfitError) step.setDetail({ reuseUnfit: error.reason, grounding: error.grounding, rounds: error.rounds });
            throw error;
          }
          step.setDetail({
            repairs: checked.repairs, judgePass: checked.judge.pass, rejectedSources: checked.rejectedSources.length,
            authorModelIds: checked.authorModelIds, judgeModelId: checked.judgeModelId,
            grounding: checked.grounding, rounds: checked.rounds, lineage: checked.lesson.lineage, visuals: checked.visuals,
            glossary: checked.glossary,
          });
          return checked;
        });
      }

      /**
       * Researches a Reading whose reused Lesson did not fit, and replaces the copied packs with what it found, so a
       * Retry after this point writes it rather than trying the same Lesson again. Nothing to cite fails the Course for
       * it, as for any Reading (spec §5.9).
       * @param slot - The Reading slot
       */
      async function researchAgain(slot: BlueprintSlot): Promise<void> {
        const search = await researchSlot(slot);
        if (lessonEvidence(search.packs).size === 0) {
          if (search.interrupted) throw new Error(`[course-generation: lesson] Research did not finish for this Reading || slotId=${slot.id}`);
          throw new LessonUnresearchableError(slot.id);
        }
        await holding((transaction) => transaction.update(lessonResearch)
          .set({ sourcePacks: search.packs, reusedLessonId: null, researchedAt: new Date() })
          .where(and(eq(lessonResearch.courseRequestId, courseRequestId), eq(lessonResearch.slotId, slot.id))).returning({ id: lessonResearch.id }));
        packsBySlot.set(slot.id, search.packs);
        reusedBySlot.delete(slot.id);
      }

      // Lessons are written one at a time in Blueprint order. A Quiz reads its Readings from their checkpoints, not
      // this run's memory, so it assesses exactly what was saved; every Reading it assesses precedes it.
      const quizGenerator = options.quizGenerator ?? createQuizGenerator({ transport });
      const goalCheckGenerator = options.goalCheckGenerator ?? createGoalCheckGenerator({ transport });
      for (const [position, slot] of slots.entries()) {
        const saved = finished.find((row) => row.slotId === slot.id);
        if (slot.method === readingPlugin.id && saved) {
          priorLessons.push({
            title: saved.title,
            lessonGoal: saved.lessonGoal,
            objectives: saved.objectives,
            headings: (saved.body as ReadingBody).sections.map((section) => section.heading),
            terms: (saved.body as ReadingBody).glossary ?? [],
          });
        }
        if (saved) continue;
        stage = { kind: "lesson", title: slot.title };
        await control.progress("lesson", slot.id);

        if (slot.method === readingPlugin.id) {
          await draftChapterFrom(position);
          // A reused Lesson that cannot be made to fit is researched now and written like any other (spec §5.8).
          const { lesson, judge, rejectedSources, authorModelIds, judgeModelId } = await writeReading(slot, position).catch(async (error: unknown) => {
            if (!(error instanceof ReuseUnfitError)) throw error;
            await researchAgain(slot);
            return writeReading(slot, position);
          });
          await holding((transaction) => transaction.insert(unpublishedLessons).values({
            ...lesson, courseRequestId, position, rejectedSources, judge, authorModelIds, judgeModelId, writeTimeProfile: profile,
          }));
          priorLessons.push({
            title: lesson.title,
            lessonGoal: lesson.lessonGoal,
            objectives: lesson.objectives,
            headings: lesson.body.sections.map((section) => section.heading),
            terms: lesson.body.glossary ?? [],
          });
          continue;
        }

        const readings = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
        const assessed = slot.assessesSlotIds.flatMap((slotId) => {
          const checkpoint = readings.find((row) => row.slotId === slotId && row.teachingMethod === readingPlugin.id);
          return checkpoint ? [{ ...checkpoint, body: checkpoint.body as ReadingBody }] : [];
        });

        if (slot.method === GOAL_CHECK_METHOD_ID) {
          // The Goal Check checks the Learning Goal across the whole Course (SEN-81); it plays like a Quiz, so it is
          // written with the quiz plugin's write-time fields.
          const { lesson, judge, authorModelIds, judgeModelId } = await withPipelineEvent("goal_check", {
            label: slot.title, detail: { slotId: slot.id, position, assessedSlotIds: slot.assessesSlotIds, objectives: slot.objectives },
          }, async (step) => {
            let checked: CheckedGoalCheck;
            try {
              checked = await goalCheckGenerator.generate({
                courseTitle: approved.blueprint.courseTitle,
                learningGoal: request.learningGoal,
                scope,
                startingLevel: diagnostic?.startingLevel?.remainingGapStatement ?? null,
                slot,
                slots,
                assessed,
                profile: writeTimeProfile(quizPlugin, resolved),
              });
            } catch (error) {
              // A rejected Goal Check is saved nowhere else, so the event keeps every draft and verdict, pass or fail.
              if (error instanceof GoalCheckFailedError) step.setDetail({ rounds: error.rounds });
              throw error;
            }
            step.setDetail({
              repairs: checked.repairs, judgePass: checked.judge.pass,
              authorModelIds: checked.authorModelIds, judgeModelId: checked.judgeModelId, rounds: checked.rounds,
            });
            return checked;
          });
          await holding((transaction) => transaction.insert(unpublishedLessons).values({
            ...lesson, courseRequestId, position, rejectedSources: [], judge, authorModelIds, judgeModelId,
            writeTimeProfile: writeTimeProfile(quizPlugin, resolved),
          }));
          continue;
        }

        const { lesson, judge, authorModelIds, judgeModelId } = await withPipelineEvent("quiz", {
          label: slot.title, detail: { slotId: slot.id, position, assessedSlotIds: slot.assessesSlotIds },
        }, async (step) => {
          let checked: CheckedQuiz;
          try {
            checked = await quizGenerator.generate({
              courseTitle: approved.blueprint.courseTitle,
              learningGoal: request.learningGoal,
              scope,
              slot,
              slots,
              assessed,
              profile: writeTimeProfile(quizPlugin, resolved),
            });
          } catch (error) {
            // A rejected Quiz is saved nowhere else, so the event keeps every draft and verdict, pass or fail.
            if (error instanceof QuizFailedError) step.setDetail({ grounding: error.grounding, rounds: error.rounds });
            throw error;
          }
          step.setDetail({
            repairs: checked.repairs, judgePass: checked.judge.pass, grounding: checked.grounding,
            authorModelIds: checked.authorModelIds, judgeModelId: checked.judgeModelId, rounds: checked.rounds,
          });
          return checked;
        });
        await holding((transaction) => transaction.insert(unpublishedLessons).values({
          ...lesson, courseRequestId, position, rejectedSources: [], judge, authorModelIds, judgeModelId,
          writeTimeProfile: writeTimeProfile(quizPlugin, resolved),
        }));
      }

      stage = { kind: "course" };
      await control.progress("publish", null);
      const checkpoints = await db.select().from(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
      const codeFailures = courseCodeFailures(approved, checkpoints);
      if (codeFailures.length) throw new CourseFailedError(codeFailures, null);
      if (!diagnostic?.startingLevel) throw new Error(`[course-generation: publish] Request has no Starting Level || requestId=${courseRequestId}`);
      const courseJudge = options.courseJudge ?? createCourseJudge({ transport });
      // A checkpoint from before SEN-57 names no author; the primary Generator wrote it.
      const authors = new Set(checkpoints.flatMap((checkpoint) =>
        checkpoint.authorModelIds.length ? checkpoint.authorModelIds : [loadModelConfig().generatorModel]));
      const outline = courseOutline(approved, checkpoints, request.learningGoal, diagnostic.startingLevel.remainingGapStatement, scope);
      const verdict = await withPipelineEvent("course_judge", { detail: { authorModelIds: [...authors] } }, async (step) => {
        const judged = await courseJudge.judge(outline, [...authors]);
        step.setDetail({ pass: judged.pass, failedChecks: judged.failedChecks });
        return judged;
      });
      if (!verdict.pass) throw new CourseFailedError([], verdict);

      const rows = publicationRows({
        learnerId, courseRequestId, subject: request.subject, learningGoal: request.learningGoal, approved, checkpoints,
      });
      await withPipelineEvent("publish", { detail: { lessons: rows.lessons.length, modules: rows.modules.length } }, () => db.transaction(async (transaction) => {
        await control.hold(transaction);
        await transaction.insert(publishedCourses).values(rows.course);
        await transaction.insert(publishedModules).values(rows.modules);
        await transaction.insert(publishedLessons).values(rows.lessons);
        const [published] = await transaction.update(courseRequests).set({ status: "published" })
          .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
        if (!published) throw new Error(`[course-generation: publish] Request is no longer generating || requestId=${courseRequestId}`);
        await control.settle(transaction, "succeeded");
      }));
    } catch (error) {
      // A run that lost its job records nothing: Cancel already moved the Request, or another worker owns it. A call cut
      // off by that loss may end in any error, but the loss is what stopped the run.
      if (control.signal.aborted) throw control.signal.reason;
      if (error instanceof LeaseLostError) throw error;
      try {
        // What the failure can promise a Retry keeps depends on how many Lessons are checkpointed (SEN-95).
        const written = await db.select({ id: unpublishedLessons.id }).from(unpublishedLessons)
          .where(eq(unpublishedLessons.courseRequestId, courseRequestId));
        const settled = settledStatus(error);
        // A sequence that misses the goal is the plan's fault, so the Request goes back for a new one (spec §5.1, SEN-85).
        const [plan] = settled === "needs_new_blueprint"
          ? await db.select().from(courseBlueprints).where(eq(courseBlueprints.courseRequestId, courseRequestId)).limit(1)
          : [];
        await db.transaction(async (transaction) => {
          await control.settle(transaction, settled);
          if (error instanceof LessonUnresearchableError) {
            await transaction.delete(lessonResearch)
              .where(and(eq(lessonResearch.courseRequestId, courseRequestId), eq(lessonResearch.slotId, error.slotId)));
          }
          const structural = plan !== undefined && error instanceof CourseFailedError ? error : null;
          const [moved] = await transaction.update(courseRequests)
            .set({ status: structural ? "blueprint_preparing" : "generation_failed", failureReason: failureReason(stage, error, written.length) })
            .where(and(eq(courseRequests.id, courseRequestId), eq(courseRequests.status, "generating"))).returning({ id: courseRequests.id });
          // Only a Request this run still owned is taken apart: one that moved on (a Cancel, or a publish) keeps everything.
          if (!structural || !moved) return;
          // Nothing written under the failed plan survives it: its Lessons are discarded (spec §5.1), and its stored
          // research is keyed to slot ids the new plan will not have.
          await transaction.delete(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, courseRequestId));
          await transaction.delete(lessonResearch).where(eq(lessonResearch.courseRequestId, courseRequestId));
          // The approved snapshot goes, so no worker generates this plan again; the draft carries why it has to change.
          const { learnerFeedback: _marks, ...draft } = plan.draft;
          await transaction.update(courseBlueprints)
            .set({ draft: { ...draft, sequenceFailure: { reasons: structural.judge?.reasons ?? [] } }, approved: null, approvedAt: null })
            .where(eq(courseBlueprints.id, plan.id)).returning({ id: courseBlueprints.id });
          await enqueueJob(transaction, { courseRequestId, learnerId, kind: "blueprint" });
        });
      } catch (recordError) {
        if (recordError instanceof LeaseLostError) throw error;
        const detail = (caught: unknown) => caught instanceof Error ? caught.message : String(caught);
        throw new Error(`[course-generation: start] Failed to record the generation failure || requestId=${courseRequestId} || ${detail(recordError)} || ${detail(error)}`);
      }
      throw error;
    }
  }
}
