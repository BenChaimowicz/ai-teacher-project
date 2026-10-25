import { Home, MessageCircle, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ComposeFlow } from "@/components/make-course/compose-flow.tsx";
import { ThreadEnd, WorkingLine, useAutoStep } from "@/components/make-course/flow.tsx";
import { errorText, requestAction } from "@/components/make-course/request-api.ts";
import { Button } from "@/components/ui/button.tsx";
import { LearnerEcho, NibblesLine } from "@/components/ui/chat-thread.tsx";
import { Input } from "@/components/ui/input.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import type { CourseRequestRecord } from "@/lib/course-request-types.ts";

/** Statuses this stage owns. */
export const VALIDITY_STATUSES = new Set(["draft", "awaiting_validity", "awaiting_clarification", "rejected"]);

/** The gate's copy when an answer did not resolve the question (apps/api validity.ts). */
const UNRESOLVED = "The answer has not resolved the original question.";

/**
 * What the Learner asked for, as the start of the thread: the topic, the goal, and any clarification already given.
 */
export function RequestHistory({ record }: { record: CourseRequestRecord }) {
  if (record.status === "draft") return null;
  return (
    <>
      {record.revisedFromId ? (
        <p className="mk-note mb-2">
          A new try at an earlier request. <Link className="mk-link" to={`/course-requests/${record.revisedFromId}`}>View original request</Link>
        </p>
      ) : null}
      <NibblesLine>What would you like to learn?</NibblesLine>
      <LearnerEcho>{record.subject}</LearnerEcho>
      <NibblesLine>What would you like to get out of it?</NibblesLine>
      <LearnerEcho>{record.learningGoal}</LearnerEcho>
      {record.clarification ? (
        <>
          <NibblesLine><b>{record.clarification.question}</b></NibblesLine>
          <LearnerEcho>{record.clarification.answer}</LearnerEcho>
        </>
      ) : null}
    </>
  );
}

type StageProps = {
  record: CourseRequestRecord;
};

/**
 * Validity: the check starts by itself once the Request is saved; then pass (the next stage takes over), one
 * clarification answered by tapping, or a decline with a safer framing and Revise request. A revised draft reopens the
 * topic field.
 */
export function ValidityStage({ record }: StageProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  // A new decision replaces the pick: history shows it from the saved Request instead.
  useEffect(() => setPicked(null), [record.status, record.clarification?.answer]);

  /** Runs the Validity check, with the clarification answer when there is one. */
  async function check(answer?: string) {
    setBusy(true);
    setError(null);
    try {
      await requestAction(`/${record.id}/validity`, "POST", answer === undefined ? {} : { answer }, "I couldn't finish checking that. Nothing changed; try again.");
    } catch (caught: unknown) {
      setError(errorText(caught));
      setPicked(null);
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  // The check is a server step the Learner does not trigger (spec §3).
  useAutoStep(record.status === "awaiting_validity" ? `validity:${record.id}` : null, () => check());

  if (record.status === "draft") {
    return (
      <>
        {record.revisedFromId ? (
          <p className="mk-note mb-2"><Link className="mk-link" to={`/course-requests/${record.revisedFromId}`}>View original request</Link></p>
        ) : null}
        <ComposeFlow
          initialSubject={record.subject}
          onCompose={async (subject, learningGoal) => {
            await requestAction(`/${record.id}`, "PATCH", { subject, learningGoal }, "Could not save your changes. Please try again.");
          }}
        />
      </>
    );
  }

  if (record.status === "awaiting_validity") {
    return (
      <>
        {error ? (
          <>
            <NibblesLine mood="think"><span role="alert">{error}</span></NibblesLine>
            <OptionTiles key={`${record.status}-t0`}
              label="Checking didn't finish"
              resetKey={attempt}
              options={[
                { id: "retry", label: "Try again", description: "Check it again", icon: <RefreshCw />, tone: "primary" },
                { id: "home", label: "Back to Home", description: "It's saved; come back anytime", icon: <Home />, tone: "quiet" },
              ]}
              onPick={(option) => (option.id === "retry" ? check() : navigate("/"))}
            />
          </>
        ) : (
          <NibblesLine mood="think"><WorkingLine>Checking that's something I can teach…</WorkingLine></NibblesLine>
        )}
        <ThreadEnd watch={`${error}|${busy}`} />
      </>
    );
  }

  if (record.status === "awaiting_clarification") {
    const question = record.validity?.question ?? record.clarification?.question ?? "";
    const unresolved = Boolean(record.clarification) && record.validity?.reason.startsWith(UNRESOLVED);
    const answers = record.validity?.answerOptions ?? [];
    const options: OptionTile<string>[] = [
      ...answers.map((answer, index) => ({ id: `a${index}`, label: answer, icon: <MessageCircle />, value: answer })),
      { id: "change", label: "None of these", description: "Change the topic instead", icon: <Pencil />, tone: "quiet" as const },
    ];
    return (
      <>
        <NibblesLine typing key={`${record.id}-${record.clarification?.answer ?? ""}`}>
          {unresolved ? "That didn't quite settle it. Same question, one more time:" : "One quick question before I start."}
        </NibblesLine>
        <NibblesLine continued><b>{question}</b></NibblesLine>
        {answers.length ? (
          <OptionTiles key={`${record.status}-t1-${record.clarification?.answer ?? ""}`}
            label={question}
            resetKey={attempt}
            cols={1}
            options={options}
            onPick={(option) => {
              if (option.id === "change") {
                navigate(`/new-course-request?subject=${encodeURIComponent(record.subject)}`);
                return;
              }
              setPicked(option.value!);
              return check(option.value);
            }}
          />
        ) : (
          <LegacyAnswer busy={busy} onAnswer={(answer) => { setPicked(answer); void check(answer); }} />
        )}
        {picked && !error ? <LearnerEcho>{picked}</LearnerEcho> : null}
        {busy ? <NibblesLine mood="think"><WorkingLine>Thanks. Checking again…</WorkingLine></NibblesLine> : null}
        {error ? <NibblesLine mood="think"><span role="alert">{error}</span> <span className="mk-faint">Pick again to retry.</span></NibblesLine> : null}
        <ThreadEnd watch={`${picked}|${busy}|${error}`} />
      </>
    );
  }

  // Rejected: say why, offer the safer framing, and Revise request. The decision stays in history; no appeal (spec §3).
  return (
    <>
      <NibblesLine mood="think">I can't make this one. <span className="mk-faint">{record.validity?.reason}</span></NibblesLine>
      {record.validity?.safeReframe ? <NibblesLine continued>What I could do instead: {record.validity.safeReframe}</NibblesLine> : null}
      <OptionTiles key={`${record.status}-t2`}
        label="What next?"
        resetKey={attempt}
        options={[
          { id: "revise", label: "Revise request", description: "Change the topic or goal; this one stays as it is", icon: <Pencil />, tone: "primary" },
          { id: "home", label: "Back to Home", icon: <Home />, tone: "quiet" },
        ]}
        onPick={async (option) => {
          if (option.id === "home") {
            navigate("/");
            return;
          }
          try {
            const { courseRequest } = await requestAction(`/${record.id}/revise`, "POST", {}, "Could not start a revised request. The original is unchanged.");
            navigate(`/course-requests/${courseRequest.id}`);
          } catch (caught: unknown) {
            setError(errorText(caught));
            setAttempt((n) => n + 1);
          }
        }}
      />
      {error ? <NibblesLine mood="think"><span role="alert">{error}</span></NibblesLine> : null}
      <ThreadEnd watch={error} />
    </>
  );
}

/**
 * Requests saved before clarifications offered answers have none to tap; they keep a short answer field.
 */
function LegacyAnswer({ busy, onAnswer }: { busy: boolean; onAnswer: (answer: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mk-topic">
      <form onSubmit={(event) => { event.preventDefault(); if (value.trim()) onAnswer(value.trim()); }}>
      <label htmlFor="clarification-answer" className="sr-only">Your answer</label>
      <Input id="clarification-answer" value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} />
        <Button type="submit" disabled={busy || !value.trim()}>Answer</Button>
      </form>
    </div>
  );
}
