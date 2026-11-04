import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GOAL_CHECK_MISSING_REASON_LABELS,
  GOAL_CHECK_MISSING_REASONS,
  GOAL_CHECK_OTHER_MAX_LENGTH,
  type GoalCheckMissingReason,
  type GoalCheckNextStep,
  type MissedObjective,
} from "@senoy/db/goal-check";
import type { QuizScore } from "@senoy/db/quiz";
import { ArrowRight, Check, Coffee, Layers, Send } from "lucide-react";
import { useCountUp } from "@/components/learn/count-up.tsx";
import { GOAL_OUTCOME_LABEL, GOAL_OUTCOME_SUB } from "@/components/learn/goal-check-copy.ts";
import { Button } from "@/components/ui/button.tsx";
import { CompanionLine, LearnerEcho } from "@/components/ui/chat-thread.tsx";
import { Textarea } from "@/components/ui/input.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import { requestJson } from "@/lib/api.ts";
import { cheer, confettiAt } from "@/lib/cheer.ts";
import type { GoalCheckFeedbackView, GoalCheckNextStepReply, GoalCheckView, StudyLesson } from "@/lib/study-types.ts";
import { cn } from "@/lib/utils";
import "@/components/learn/learn.css";
import "@/components/learn/goal-check.css";

const pad = (n: number) => String(n).padStart(2, "0");

/** What the Learner reads for each next step after "not met". */
const NEXT_STEP_LABEL: Record<GoalCheckNextStep, string> = {
  new_course: "Make a new Course with what was missing",
  nothing: "Nothing for now",
};

/**
 * The goal objectives the best attempt missed, each with links back to the Lessons that teach it. Shared by the Goal
 * Check result in Study and the Course-complete screen. Renders nothing when nothing was missed.
 * @param courseId - Course
 * @param missed - Missed objectives, in the order the Goal Check lists them
 * @param lessonTitles - Title of every Lesson by id; a Lesson not in it gets no link
 */
export function MissedObjectives({ courseId, missed, lessonTitles }: { courseId: string; missed: MissedObjective[]; lessonTitles: ReadonlyMap<string, string> }) {
  if (missed.length === 0) return null;
  return (
    <section className="l-goal-miss" aria-label="Worth another look">
      <p className="h">worth another look</p>
      <ul>
        {missed.map((row, index) => {
          const links = row.lessonIds.filter((id) => lessonTitles.has(id));
          return (
            <li key={row.objective} style={{ "--i": index } as CSSProperties}>
              <span className="o">{row.objective}</span>
              {links.length > 0 ? (
                <span className="ls">
                  {links.map((id) => (
                    <Link key={id} to={`/study/${courseId}/lessons/${id}`} className="lk">
                      <ArrowRight aria-hidden="true" />
                      <span className="sr-only">Go back to </span>
                      {lessonTitles.get(id)}
                    </Link>
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type ResultCardProps = {
  courseId: string;
  lessonId: string;
  /** The goal the result is set against. */
  learningGoal: string;
  goal: GoalCheckView;
  /** This attempt's score; the outcome is by the best one. */
  attemptScore: QuizScore;
  results: boolean[];
  lessons: StudyLesson[];
  busy: boolean;
  celebrate: boolean;
  onRetake: () => void;
};

/**
 * The Goal Check result (SEN-81): the best score counting up, met / partly met / not met against the Learning Goal,
 * one chip per question of this attempt, the missed objectives with links back to their Lessons, and Retake.
 * "Not met" goes on to ask what was missing, then what next (decision 2026-11-04); "partly met" asks nothing.
 */
export function GoalCheckResultCard({ courseId, lessonId, learningGoal, goal, attemptScore, results, lessons, busy, celebrate, onRetake }: ResultCardProps) {
  const card = useRef<HTMLDivElement>(null);
  const shown = useCountUp(goal.best.correct, 700, 150);
  const lessonTitles = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));
  const thisTry = attemptScore.correct !== goal.best.correct || attemptScore.total !== goal.best.total;

  useEffect(() => {
    if (!celebrate || goal.outcome !== "met" || !card.current) return;
    const el = card.current;
    const timer = window.setTimeout(() => {
      confettiAt(el, { count: 90, spread: 1.5 });
      cheer(el.querySelector(".l-sc-num"), "goal met");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [celebrate, goal.outcome]);

  return (
    <>
      <div ref={card} className={cn("l-score l-goal", goal.outcome === "met" && "pass", goal.outcome)}>
        <div className="l-sc-top">
          <div className="l-sc-num" aria-hidden="true">
            <b>{shown}</b>
            <span>/{goal.best.total}</span>
          </div>
          <div className="min-w-0">
            <div className="l-sc-label">{GOAL_OUTCOME_LABEL[goal.outcome]}</div>
            <p role="status" className="l-sc-sub">
              {GOAL_OUTCOME_LABEL[goal.outcome]}. Your best is {goal.best.correct} / {goal.best.total}.
              {thisTry ? ` This try: ${attemptScore.correct} / ${attemptScore.total}.` : ""} {GOAL_OUTCOME_SUB[goal.outcome]}
            </p>
          </div>
        </div>
        <p className="l-goal-aim">
          <span className="k">your goal</span>
          <span className="g">{learningGoal}</span>
        </p>
        <div className="l-sc-res" aria-hidden="true">
          {results.map((right, index) => (
            <i key={index} className={right ? "good" : "miss"}>
              {pad(index + 1)} {right ? "✓" : "✕"}
            </i>
          ))}
        </div>
        <MissedObjectives courseId={courseId} missed={goal.missedObjectives} lessonTitles={lessonTitles} />
        <div className="l-sc-actions">
          <Button variant={goal.outcome === "met" ? "ghost" : "secondary"} onClick={onRetake} disabled={busy}>
            Retake
          </Button>
        </div>
      </div>
      {goal.outcome === "met" ? (
        <CompanionLine key="goal-after" mood="cheer">
          That's the goal. Nicely done.
        </CompanionLine>
      ) : goal.outcome === "partly_met" ? (
        <CompanionLine key="goal-after">
          Most of the way there. The parts above are worth another look, and you can retake this as often as you like.
        </CompanionLine>
      ) : (
        <NotMetFollowUp key="goal-after" courseId={courseId} lessonId={lessonId} initial={goal.feedback} missed={goal.missedObjectives} />
      )}
    </>
  );
}

/**
 * After "not met": what was missing (the feedback form), then what next. Picks up where the Learner left off on a
 * reload: saved feedback shows as their answer, and a saved next step as their choice.
 */
function NotMetFollowUp({ courseId, lessonId, initial, missed }: { courseId: string; lessonId: string; initial: GoalCheckFeedbackView | null; missed: MissedObjective[] }) {
  const [feedback, setFeedback] = useState<GoalCheckFeedbackView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const base = `/api/courses/${courseId}/lessons/${lessonId}/goal-check`;

  /**
   * Sends what was missing.
   * @param reasons - Picked reasons
   * @param otherText - Free text for "Something else", or null
   */
  async function send(reasons: GoalCheckMissingReason[], otherText: string | null) {
    setError(null);
    try {
      const json = await requestJson<{ feedback: Partial<GoalCheckFeedbackView> }>(`${base}/feedback`, "PUT", { reasons, otherText }, "Could not send that");
      setFeedback({ reasons: json.feedback.reasons ?? reasons, otherText: json.feedback.otherText ?? otherText, nextStep: json.feedback.nextStep ?? null });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not send that");
      throw caught;
    }
  }

  /**
   * Saves the next step; a new Course opens the prefilled New course screen.
   * @param nextStep - The Learner's choice
   */
  async function choose(nextStep: GoalCheckNextStep) {
    setError(null);
    try {
      const json = await requestJson<GoalCheckNextStepReply>(`${base}/next-step`, "PUT", { nextStep }, "Could not save that");
      if (json.nextStep === "new_course" && json.newCourseHref) {
        navigate(json.newCourseHref);
        return;
      }
      setFeedback((current) => (current ? { ...current, nextStep: json.nextStep } : current));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not save that");
    }
  }

  const missing = missed.map((row) => row.objective).join("; ");
  const newCourse: OptionTile<GoalCheckNextStep> = {
    id: "new_course",
    label: NEXT_STEP_LABEL.new_course,
    description: missing ? `Starting from: ${missing}` : "Built around what you said was missing",
    icon: <Layers />,
    tone: "primary",
    value: "new_course",
  };
  const nothing: OptionTile<GoalCheckNextStep> = {
    id: "nothing",
    label: NEXT_STEP_LABEL.nothing,
    description: "This Course stays here",
    icon: <Coffee />,
    tone: "quiet",
    value: "nothing",
  };

  return (
    <>
      <CompanionLine>Help me get the next one right.</CompanionLine>
      <CompanionLine continued>What was missing? Pick any that fit.</CompanionLine>
      {feedback ? (
        <LearnerEcho>
          {feedback.reasons
            .filter((reason) => reason !== "other")
            .map((reason) => GOAL_CHECK_MISSING_REASON_LABELS[reason])
            .concat(feedback.otherText ? [`“${feedback.otherText}”`] : [])
            .join(" · ")}
        </LearnerEcho>
      ) : (
        <GoalFeedbackForm onSend={send} />
      )}
      {feedback ? (
        <>
          <CompanionLine typing delayMs={600}>
            Thanks, that helps. What now?
          </CompanionLine>
          {feedback.nextStep ? (
            <>
              <LearnerEcho>{NEXT_STEP_LABEL[feedback.nextStep]}</LearnerEcho>
              {feedback.nextStep === "nothing" ? (
                <>
                  <CompanionLine>Fair enough. Everything here stays open. If you change your mind:</CompanionLine>
                  <OptionTiles options={[newCourse]} label="Change your mind" cols={1} keyboard={false} onPick={() => choose("new_course")} />
                </>
              ) : (
                <>
                  <CompanionLine>Your new Course starts from what was missing.</CompanionLine>
                  <OptionTiles
                    options={[{ ...newCourse, label: "Open it again" }]}
                    label="Open the new Course"
                    cols={1}
                    keyboard={false}
                    onPick={() => choose("new_course")}
                  />
                </>
              )}
            </>
          ) : (
            <OptionTiles options={[newCourse, nothing]} label="What now?" onPick={(option) => choose(option.value!)} />
          )}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="l-error">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * The "not met" feedback form: the fixed reasons as toggles (any number), "Something else" opens a text box of at most
 * {@link GOAL_CHECK_OTHER_MAX_LENGTH} characters, then Send. Send waits for at least one reason, and for text when
 * "Something else" is on.
 * @param onSend - Sends the feedback; rejects to unlock the form again
 */
function GoalFeedbackForm({ onSend }: { onSend: (reasons: GoalCheckMissingReason[], otherText: string | null) => Promise<void> }) {
  const [picked, setPicked] = useState<GoalCheckMissingReason[]>([]);
  const [other, setOther] = useState("");
  const [sending, setSending] = useState(false);
  const otherOn = picked.includes("other");
  const valid = picked.length > 0 && (!otherOn || (other.trim().length > 0 && other.length <= GOAL_CHECK_OTHER_MAX_LENGTH));

  /**
   * Turns a reason on or off.
   * @param reason - The reason
   */
  function toggle(reason: GoalCheckMissingReason) {
    setPicked((current) => (current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]));
  }

  /** Sends the form once it is valid. */
  async function submit() {
    if (!valid || sending) return;
    setSending(true);
    try {
      await onSend(picked, otherOn ? other.trim() : null);
    } catch {
      setSending(false);
    }
  }

  return (
    <div className={cn("l-gfb", sending && "locked")} role="group" aria-label="What was missing?">
      {GOAL_CHECK_MISSING_REASONS.map((reason, index) => (
        <button
          key={reason}
          type="button"
          className="k-tile"
          style={{ "--i": index } as CSSProperties}
          aria-pressed={picked.includes(reason)}
          disabled={sending}
          onClick={() => toggle(reason)}
        >
          <span className="box" aria-hidden="true">
            <Check />
          </span>
          <span>
            <span className="tt">{GOAL_CHECK_MISSING_REASON_LABELS[reason]}</span>
          </span>
        </button>
      ))}
      {otherOn ? (
        <div className="l-gfb-other">
          <label htmlFor="goal-check-other" className="sr-only">
            What else was missing?
          </label>
          <Textarea
            id="goal-check-other"
            placeholder="What else was missing?"
            value={other}
            maxLength={GOAL_CHECK_OTHER_MAX_LENGTH}
            disabled={sending}
            onChange={(event) => setOther(event.target.value)}
          />
          <span className="cnt" aria-live="polite">
            {other.length}/{GOAL_CHECK_OTHER_MAX_LENGTH}
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className="k-tile primary send"
        style={{ "--i": GOAL_CHECK_MISSING_REASONS.length } as CSSProperties}
        disabled={!valid || sending}
        onClick={() => void submit()}
      >
        <span className="ti" aria-hidden="true">
          <Send />
        </span>
        <span>
          <span className="tt">Send</span>
          <span className="td">{picked.length ? `${picked.length} picked` : "Pick any above"}</span>
        </span>
      </button>
    </div>
  );
}
