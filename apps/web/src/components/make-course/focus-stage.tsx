import { Check, Home, MessageCircle, PenLine, RefreshCw, Telescope, Undo2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_FOCUS_ROUNDS, type FocusAnswer, type FocusProposal, type FocusQuestion, type FocusRound } from "@senoy/db/course-request";
import { ThreadEnd, WorkingLine, useAutoStep } from "@/components/make-course/flow.tsx";
import { errorText, requestAction } from "@/components/make-course/request-api.ts";
import { Button } from "@/components/ui/button.tsx";
import { CompanionLine, LearnerEcho, ThreadCard } from "@/components/ui/chat-thread.tsx";
import { Input } from "@/components/ui/input.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import type { CourseRequestRecord } from "@/lib/course-request-types.ts";

/** Statuses this stage owns (SEN-90); later statuses show the exchange as history. */
export const FOCUS_STATUSES = new Set(["validity_passed", "awaiting_focus_answers", "awaiting_focus_confirmation"]);

/** The longest answer in the Learner's own words. */
const OWN_WORDS_MAX = 300;

const BROAD = "A broad overview is fine";
const CONFIRM = "That's it";
const NOT_QUITE = "Not quite";
const PROPOSAL_LINE = "Here's the course I'd make:";

/** What is running right now. */
type Busy = "start" | "answers" | "confirm" | "not-quite" | "skip" | null;

/**
 * Focusing the Learning Goal (SEN-90): after Validity passes, the Course Guide looks at the goal by itself. A precise
 * goal moves straight on; a broad one gets a round or two of tap-to-choose questions, one at a time, then a proposed
 * goal with what it covers and leaves out, to confirm. "A broad overview is fine" ends it at any point.
 */
export function FocusStage({ record }: { record: CourseRequestRecord }) {
  const navigate = useNavigate();
  const rounds = record.focus?.rounds ?? [];
  const openIndex = record.status === "awaiting_focus_answers" ? rounds.length - 1 : -1;
  const open = openIndex >= 0 ? rounds[openIndex] : undefined;
  const [answers, setAnswers] = useState<FocusAnswer[]>([]);
  const [ownWords, setOwnWords] = useState(false);
  const [echo, setEcho] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [backs, setBacks] = useState(0);

  // A new round or a proposal replaces whatever was picked here; history shows it from the saved Request.
  useEffect(() => {
    setAnswers([]);
    setOwnWords(false);
    setEcho(null);
    setError(null);
  }, [record.status, rounds.length]);

  /**
   * Sends one focus action. Failures (a model call that didn't finish, or a stale step) leave the Request unchanged.
   * @returns Whether it went through
   */
  async function run(kind: Exclude<Busy, null>, path: string, body: object, fallback: string) {
    setBusy(kind);
    setError(null);
    try {
      await requestAction(`/${record.id}${path}`, "POST", body, fallback);
      return true;
    } catch (caught: unknown) {
      setError(errorText(caught, fallback));
      setAttempt((n) => n + 1);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const start = () => run("start", "/focus", {}, "I couldn't look at your goal just then. Nothing changed; try again.");
  const sendAnswers = (all: FocusAnswer[]) => run("answers", "/focus", { answers: all }, "I couldn't take your answers just then. Nothing changed; try again.");

  /** Ends focusing with a broad overview; on failure the options come back. */
  async function skip() {
    setEcho(BROAD);
    if (!(await run("skip", "/focus/skip", {}, "I couldn't save that. Nothing changed; pick again."))) setEcho(null);
  }

  // Looking at the goal is a server step the Learner does not trigger (spec §3).
  useAutoStep(record.status === "validity_passed" ? `focus:${record.id}` : null, start);

  const errorLine = (hint?: string) => error ? (
    <CompanionLine mood="think"><span role="alert">{error}</span>{hint ? <> <span className="mk-faint">{hint}</span></> : null}</CompanionLine>
  ) : null;
  const retryTiles = (label: string, onRetry: () => unknown) => (
    <OptionTiles key={`focus-retry-${attempt}`}
      label={label}
      options={[
        { id: "retry", label: "Try again", icon: <RefreshCw />, tone: "primary" },
        { id: "home", label: "Back to Home", description: "It's saved; come back anytime", icon: <Home />, tone: "quiet" },
      ]}
      onPick={async (option) => { if (option.id === "retry") await onRetry(); else navigate("/"); }}
    />
  );

  if (record.status === "validity_passed") {
    return (
      <>
        {error ? (
          <>
            {errorLine()}
            {retryTiles("Looking at your goal didn't finish", start)}
          </>
        ) : (
          <CompanionLine mood="think"><WorkingLine>Looking at your goal…</WorkingLine></CompanionLine>
        )}
        <ThreadEnd watch={`${error}|${busy}`} />
      </>
    );
  }

  if (record.status === "awaiting_focus_answers" && open) {
    const question = open.questions[answers.length];
    const sending = !question && !echo;

    /** Keeps one answer; after the last question, sends the round. */
    const answer = (q: FocusQuestion, text: string, own: boolean) => {
      const next = [...answers, { questionId: q.id, answer: text, ownWords: own }];
      setAnswers(next);
      setOwnWords(false);
      if (next.length === open.questions.length) void sendAnswers(next);
    };

    return (
      <>
        <FocusRounds rounds={rounds.slice(0, openIndex)} />
        <RoundIntro round={open} index={openIndex} />
        {open.questions.slice(0, answers.length).map((q, index) => (
          <QuestionAnswer key={q.id} question={q.question} answer={answers[index]?.answer ?? null} continued={index === 0} />
        ))}
        {question && !echo ? (
          <>
            <CompanionLine typing delayMs={380} continued={answers.length === 0} key={`ask-${question.id}`}><b>{question.question}</b></CompanionLine>
            <OptionTiles
              key={`${question.id}-${attempt}-${backs}`}
              label={question.question}
              cols={1}
              options={questionTiles(question)}
              onPick={(option) => {
                if (option.id === "own") setOwnWords(true);
                else if (option.id === "broad") return skip();
                else answer(question, option.value!, false);
              }}
            />
            {ownWords ? (
              <OwnWords
                onBack={() => { setOwnWords(false); setBacks((n) => n + 1); }}
                onAnswer={(text) => answer(question, text, true)}
              />
            ) : null}
            {errorLine("Pick again to retry.")}
          </>
        ) : null}
        {echo ? <LearnerEcho>{echo}</LearnerEcho> : null}
        {busy === "answers" ? <CompanionLine mood="think"><WorkingLine>Thanks. Thinking it over…</WorkingLine></CompanionLine> : null}
        {sending && error && busy === null ? (
          <>
            {errorLine()}
            {retryTiles("Sending didn't finish", () => sendAnswers(answers))}
          </>
        ) : null}
        <ThreadEnd watch={`${answers.length}|${ownWords}|${busy}|${error}|${echo}`} />
      </>
    );
  }

  const proposal = record.focus?.proposal;
  if (record.status === "awaiting_focus_confirmation" && proposal) {
    const roundsLeft = rounds.length < MAX_FOCUS_ROUNDS;
    const tiles: OptionTile[] = [
      { id: "confirm", label: CONFIRM, description: "Make the course about this", icon: <Check />, tone: "primary" },
      ...(roundsLeft ? [{ id: "not-quite", label: NOT_QUITE, description: "Ask me a little more", icon: <Undo2 /> }] : []),
      { id: "broad", label: BROAD, description: "Keep the goal as I wrote it", icon: <Telescope />, tone: "quiet" as const },
    ];
    return (
      <>
        <FocusRounds rounds={rounds} />
        <CompanionLine typing key={`proposal-${proposal.learningGoal}`}>{PROPOSAL_LINE}</CompanionLine>
        <ProposalCard proposal={proposal} />
        {echo ? <LearnerEcho>{echo}</LearnerEcho> : (
          <OptionTiles key={`proposal-${attempt}`}
            label="Your course's focus"
            cols={tiles.length === 3 ? 3 : 2}
            options={tiles}
            onPick={async (option) => {
              if (option.id === "broad") return skip();
              const label = option.id === "confirm" ? CONFIRM : NOT_QUITE;
              setEcho(label);
              const ok = option.id === "confirm"
                ? await run("confirm", "/focus/confirm", {}, "I couldn't save that. Nothing changed; pick again.")
                : await run("not-quite", "/focus/not-quite", {}, "I couldn't think of more questions just then. Nothing changed; pick again.");
              if (!ok) setEcho(null);
            }}
          />
        )}
        {busy === "not-quite" ? <CompanionLine mood="think"><WorkingLine>Fair enough. Thinking of better questions…</WorkingLine></CompanionLine> : null}
        {errorLine("Pick again to retry.")}
        <ThreadEnd watch={`${echo}|${busy}|${error}`} />
      </>
    );
  }

  return null;
}

/**
 * The focus exchange as history once the goal is settled: the questions and answers, then the confirmed focus or the
 * broad overview. Nothing for a precise goal or a Request from before focusing existed.
 */
export function FocusHistory({ record }: { record: CourseRequestRecord }) {
  const focus = record.focus;
  if (!focus || focus.outcome === null || focus.outcome === "precise") return null;
  const allAnswered = focus.rounds.every((round) => round.answers !== null);
  const proposal = focus.outcome === "focused" || allAnswered ? focus.proposal : null;
  return (
    <>
      <FocusRounds rounds={focus.rounds} />
      {proposal ? (
        <>
          <CompanionLine>{PROPOSAL_LINE}</CompanionLine>
          <ProposalCard proposal={proposal} />
        </>
      ) : null}
      {focus.outcome === "focused" ? <LearnerEcho>{CONFIRM}</LearnerEcho> : (
        <>
          <LearnerEcho>{BROAD}</LearnerEcho>
          <CompanionLine>A broad overview it is.</CompanionLine>
        </>
      )}
    </>
  );
}

/** Rounds as history. A round left open (skipped part-way) shows its first question only. */
function FocusRounds({ rounds }: { rounds: FocusRound[] }) {
  return (
    <>
      {rounds.map((round, index) => {
        const asked = round.answers ? round.questions : round.questions.slice(0, 1);
        return (
          <Fragment key={index}>
            <RoundIntro round={round} index={index} />
            {asked.map((q, qIndex) => (
              <QuestionAnswer
                key={q.id}
                question={q.question}
                answer={round.answers?.find((a) => a.questionId === q.id)?.answer ?? null}
                continued={qIndex === 0}
              />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

/** What comes before a round: why I'm asking (the first), or the proposal the Learner said wasn't quite right. */
function RoundIntro({ round, index }: { round: FocusRound; index: number }) {
  if (round.afterProposal) {
    return (
      <>
        <CompanionLine>{PROPOSAL_LINE} <b>{round.afterProposal}</b></CompanionLine>
        <LearnerEcho>{NOT_QUITE}</LearnerEcho>
        <CompanionLine>Fair enough. A little more, then.</CompanionLine>
      </>
    );
  }
  if (index === 0) return <CompanionLine>That's a wide goal. A couple of quick questions so the course fits what you're after.</CompanionLine>;
  return <CompanionLine>A couple more.</CompanionLine>;
}

/** One asked question and, once given, its answer. */
function QuestionAnswer({ question, answer, continued }: { question: string; answer: string | null; continued: boolean }) {
  return (
    <>
      <CompanionLine continued={continued}>{question}</CompanionLine>
      {answer !== null ? <LearnerEcho>{answer}</LearnerEcho> : null}
    </>
  );
}

/** A question's tiles: its answers, then "Something else" and the way out. */
function questionTiles(question: FocusQuestion): OptionTile<string>[] {
  return [
    ...question.options.map((option, index) => ({ id: `o${index}`, label: option, icon: <MessageCircle />, value: option })),
    { id: "own", label: "Something else", description: "Say it in your own words", icon: <PenLine />, tone: "quiet" as const },
    { id: "broad", label: BROAD, description: "Skip the questions", icon: <Telescope />, tone: "quiet" as const },
  ];
}

/** The proposed goal, with what the course covers and leaves out. */
function ProposalCard({ proposal }: { proposal: FocusProposal }) {
  return (
    <ThreadCard className="mk-focus">
      <p className="mk-focus-goal">{proposal.learningGoal}</p>
      <div className="mk-scope">
        <ScopeList title="Covers" items={proposal.scope.inScope} />
        <ScopeList title="Leaves out" items={proposal.scope.outOfScope} out />
      </div>
    </ThreadCard>
  );
}

/** One side of the scope. */
function ScopeList({ title, items, out = false }: { title: string; items: string[]; out?: boolean }) {
  if (!items.length) return null;
  return (
    <section className={out ? "out" : undefined} aria-label={title}>
      <h5>{title}</h5>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

/** "Something else": the one short field in this step. Enter sends it. */
function OwnWords({ onAnswer, onBack }: { onAnswer: (text: string) => void; onBack: () => void }) {
  const [value, setValue] = useState("");
  const text = value.trim();
  return (
    <div className="mk-topic">
      <form onSubmit={(event) => { event.preventDefault(); if (text) onAnswer(text); }}>
        <label htmlFor="focus-own-words" className="sr-only">In your own words</label>
        <Input
          id="focus-own-words"
          autoFocus
          maxLength={OWN_WORDS_MAX}
          placeholder="In a few words…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" disabled={!text}>Send</Button>
      </form>
      <Button variant="link" size="sm" onClick={onBack}>Back to the options</Button>
    </div>
  );
}
