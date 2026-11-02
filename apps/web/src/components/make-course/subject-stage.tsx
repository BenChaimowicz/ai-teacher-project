import { Home, MessageCircle, PenLine, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ThreadEnd, WorkingLine, useAutoStep } from "@/components/make-course/flow.tsx";
import { OwnWords } from "@/components/make-course/focus-stage.tsx";
import { errorText, requestAction } from "@/components/make-course/request-api.ts";
import { CompanionLine, LearnerEcho } from "@/components/ui/chat-thread.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import type { CourseRequestRecord } from "@/lib/course-request-types.ts";

/** Statuses this stage owns (SEN-124); Validity follows either way. */
export const SUBJECT_STATUSES = new Set(["awaiting_subject_check", "awaiting_subject_choice"]);

/** The question, as the Course Guide asks it and as history replays it. */
export const SUBJECT_QUESTION = "Which did you mean?";

/**
 * The subject check's exchange as history, once answered: the question and what the Learner picked or typed. Nothing
 * when the subject had one reading, the check failed, or the Request is from before SEN-124.
 */
export function SubjectHistory({ record }: { record: CourseRequestRecord }) {
  const check = record.subjectCheck;
  if (!check || (check.outcome !== "chosen" && check.outcome !== "own_words") || !check.answer) return null;
  return (
    <>
      <CompanionLine>{SUBJECT_QUESTION}</CompanionLine>
      <LearnerEcho>{check.answer}</LearnerEcho>
    </>
  );
}

/**
 * Settling the subject (spec §4.2): the check starts by itself once the Request is saved. One reading moves straight on
 * to Validity; several become "Which did you mean?" with each reading and its one-line gloss, plus None of these with a
 * short typed answer.
 */
export function SubjectStage({ record }: { record: CourseRequestRecord }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ownWords, setOwnWords] = useState(false);
  const [echo, setEcho] = useState<string | null>(null);
  // A new status replaces whatever was picked here; history shows it from the saved Request.
  useEffect(() => {
    setOwnWords(false);
    setEcho(null);
    setError(null);
  }, [record.status]);

  /**
   * Sends one subject action; a failure leaves the Request unchanged.
   * @returns Whether it went through
   */
  async function run(path: string, body: object, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await requestAction(`/${record.id}${path}`, "POST", body, fallback);
      return true;
    } catch (caught: unknown) {
      setError(errorText(caught, fallback));
      setAttempt((n) => n + 1);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const check = () => run("/subject-check", {}, "I couldn't finish reading that. Nothing changed; try again.");

  /** Sends the Learner's answer; on failure the options come back. */
  async function choose(answer: string, own: boolean) {
    setEcho(answer);
    setOwnWords(false);
    if (!(await run("/subject-choice", { answer, ownWords: own }, "I couldn't save that. Nothing changed; pick again."))) setEcho(null);
  }

  // The check is a server step the Learner does not trigger (spec §3).
  useAutoStep(record.status === "awaiting_subject_check" ? `subject:${record.id}` : null, check);

  if (record.status === "awaiting_subject_check") {
    return (
      <>
        {error ? (
          <>
            <CompanionLine mood="think"><span role="alert">{error}</span></CompanionLine>
            <OptionTiles key={`${record.status}-retry`}
              label="Reading it didn't finish"
              resetKey={attempt}
              options={[
                { id: "retry", label: "Try again", icon: <RefreshCw />, tone: "primary" },
                { id: "home", label: "Back to Home", description: "It's saved; come back anytime", icon: <Home />, tone: "quiet" },
              ]}
              onPick={async (option) => { if (option.id === "retry") await check(); else navigate("/"); }}
            />
          </>
        ) : (
          <CompanionLine mood="think"><WorkingLine>Reading that…</WorkingLine></CompanionLine>
        )}
        <ThreadEnd watch={`${error}|${busy}`} />
      </>
    );
  }

  const readings = record.subjectCheck?.readings ?? [];
  const options: OptionTile<string>[] = [
    ...readings.map((reading, index) => ({ id: `r${index}`, label: reading.label, description: reading.gloss, icon: <MessageCircle />, value: reading.label })),
    { id: "own", label: "None of these", description: "Say it in a few words", icon: <PenLine />, tone: "quiet" as const },
  ];
  return (
    <>
      <CompanionLine typing key={`subject-${record.id}`}>That could mean a few things.</CompanionLine>
      <CompanionLine continued><b>{SUBJECT_QUESTION}</b></CompanionLine>
      {echo ? <LearnerEcho>{echo}</LearnerEcho> : (
        <>
          <OptionTiles key={`subject-${attempt}`}
            label={SUBJECT_QUESTION}
            cols={1}
            options={options}
            onPick={(option) => (option.id === "own" ? setOwnWords(true) : choose(option.value!, false))}
          />
          {ownWords ? (
            <OwnWords id="subject-own-words" onBack={() => { setOwnWords(false); setAttempt((n) => n + 1); }} onAnswer={(text) => void choose(text, true)} />
          ) : null}
        </>
      )}
      {error ? <CompanionLine mood="think"><span role="alert">{error}</span> <span className="mk-faint">Pick again to retry.</span></CompanionLine> : null}
      <ThreadEnd watch={`${echo}|${ownWords}|${busy}|${error}`} />
    </>
  );
}
