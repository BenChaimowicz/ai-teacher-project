import { Check, Home, MessageCircle, PenLine, RefreshCw, Telescope, Undo2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_FOCUS_ROUNDS, type FocusAnswer, type FocusProposal, type FocusQuestion, type FocusRound, type GoalScope } from "@senoy/db/course-request";
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

/** Browser storage key for one round's answers in progress. */
function roundKey(requestId: string, roundIndex: number) {
  return `goal-focus:${requestId}:${roundIndex}`;
}

/**
 * A round's answers so far, kept in this tab until the round is sent, so a reload resumes it. Anything that doesn't
 * match the round's questions in order starts it over; a full set drops its last answer, so the round is sent by a tap.
 */
function readRoundAnswers(requestId: string, roundIndex: number, round: FocusRound | undefined): FocusAnswer[] {
  if (!round || roundIndex < 0) return [];
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(roundKey(requestId, roundIndex)) ?? "null") as FocusAnswer[] | null;
    if (!Array.isArray(saved)) return [];
    const valid = saved.every((answer, index) => answer && answer.questionId === round.questions[index]?.id && typeof answer.answer === "string");
    return valid ? saved.slice(0, round.questions.length - 1) : [];
  } catch {
    return [];
  }
}

/** Keeps a round's answers so far; storage can be full or blocked, and the answers still go up at the end. */
function writeRoundAnswers(requestId: string, roundIndex: number, answers: FocusAnswer[]) {
  try {
    if (answers.length) window.sessionStorage.setItem(roundKey(requestId, roundIndex), JSON.stringify(answers));
    else window.sessionStorage.removeItem(roundKey(requestId, roundIndex));
  } catch {
    // Nothing to do; the round just won't resume after a reload.
  }
}

/** Whether a scope differs from the proposal's own split. */
function scopeMoved(proposal: GoalScope, scope: GoalScope) {
  return scope.inScope.length !== proposal.inScope.length || scope.inScope.some((item) => !proposal.inScope.includes(item));
}

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
  const [answers, setAnswers] = useState<FocusAnswer[]>(() => readRoundAnswers(record.id, openIndex, open));
  const [ownWords, setOwnWords] = useState(false);
  const [echo, setEcho] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [backs, setBacks] = useState(0);
  const proposalScope = record.focus?.proposal?.scope ?? null;
  // The proposal's Covers / Leaves out as the Learner has rearranged them.
  const [scope, setScope] = useState<GoalScope | null>(proposalScope);

  // A new round or a proposal replaces whatever was picked here; history shows it from the saved Request.
  useEffect(() => {
    setAnswers(readRoundAnswers(record.id, openIndex, open));
    setOwnWords(false);
    setEcho(null);
    setError(null);
    setScope(proposalScope);
  }, [record.id, record.status, rounds.length]);

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
  /** Sends the round; once it is in, this tab forgets its copy. */
  async function sendAnswers(all: FocusAnswer[]) {
    const ok = await run("answers", "/focus", { answers: all }, "I couldn't take your answers just then. Nothing changed; try again.");
    if (ok) writeRoundAnswers(record.id, openIndex, []);
  }

  /** Ends focusing with a broad overview; on failure the options come back. */
  async function skip() {
    setEcho(BROAD);
    if (await run("skip", "/focus/skip", {}, "I couldn't save that. Nothing changed; pick again.")) {
      if (openIndex >= 0) writeRoundAnswers(record.id, openIndex, []);
    } else setEcho(null);
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
      writeRoundAnswers(record.id, openIndex, next);
      if (next.length === open.questions.length) void sendAnswers(next);
    };

    /** Steps back one question within this round. */
    const changeLast = () => {
      const back = answers.slice(0, -1);
      setAnswers(back);
      setOwnWords(false);
      setError(null);
      writeRoundAnswers(record.id, openIndex, back);
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
            {answers.length > 0 && !ownWords ? (
              <div className="mk-back"><Button variant="link" size="sm" onClick={changeLast}>Change my last answer</Button></div>
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
    const broadGoal = record.focus?.broadGoal;
    const edited = scope ?? proposal.scope;
    const moved = scopeMoved(proposal.scope, edited);
    const tiles: OptionTile[] = [
      { id: "confirm", label: CONFIRM, description: "Make the course about this", icon: <Check />, tone: "primary" },
      ...(roundsLeft ? [{ id: "not-quite", label: NOT_QUITE, description: "Ask me a little more", icon: <Undo2 /> }] : []),
      { id: "broad", label: BROAD, description: broadGoal ? `I'll aim for: ${broadGoal}` : "A general course on it", icon: <Telescope />, tone: "quiet" as const },
    ];
    /** Moves one entry to the other list; Covers keeps at least one. */
    const move = (item: string) => {
      const inCovers = edited.inScope.includes(item);
      if (inCovers && edited.inScope.length <= 1) return;
      setScope(inCovers
        ? { inScope: edited.inScope.filter((entry) => entry !== item), outOfScope: [...edited.outOfScope, item] }
        : { inScope: [...edited.inScope, item], outOfScope: edited.outOfScope.filter((entry) => entry !== item) });
    };
    return (
      <>
        <FocusRounds rounds={rounds} />
        <CompanionLine typing key={`proposal-${proposal.learningGoal}`}>{PROPOSAL_LINE}</CompanionLine>
        <ProposalCard proposal={{ ...proposal, scope: edited }} onMove={echo || busy ? undefined : move} />
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
                ? await run("confirm", "/focus/confirm", moved ? { scope: edited } : {}, "I couldn't save that. Nothing changed; pick again.")
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
 * broad overview. A precise goal gets one line saying so; a Request from before focusing existed gets nothing.
 */
export function FocusHistory({ record }: { record: CourseRequestRecord }) {
  const focus = record.focus;
  if (!focus || focus.outcome === null) return null;
  if (focus.outcome === "precise") return <CompanionLine>That's clear. I'll aim for exactly that.</CompanionLine>;
  const allAnswered = focus.rounds.every((round) => round.answers !== null);
  const shown = focus.outcome === "focused" || allAnswered ? focus.proposal : null;
  // The card shows the lists as confirmed, after any entries the Learner moved.
  const proposal = shown && focus.outcome === "focused" && focus.scope ? { ...shown, scope: focus.scope } : shown;
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
          <CompanionLine>A broad overview it is. I'll aim for: <b>{record.learningGoal}</b></CompanionLine>
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

/**
 * The proposed goal, with what the course covers and leaves out. With `onMove`, each entry is a chip that moves it to
 * the other list (spec §4.2 Result); Covers keeps at least one.
 */
function ProposalCard({ proposal, onMove }: { proposal: FocusProposal; onMove?: (item: string) => void }) {
  const lastCover = proposal.scope.inScope.length <= 1;
  return (
    <ThreadCard className="mk-focus">
      <p className="mk-focus-goal">{proposal.learningGoal}</p>
      <div className="mk-scope">
        <ScopeList title="Covers" to="Leaves out" items={proposal.scope.inScope} onMove={onMove} locked={lastCover} />
        <ScopeList title="Leaves out" to="Covers" items={proposal.scope.outOfScope} onMove={onMove} out />
      </div>
      {onMove ? <p className="mk-scope-hint">Tap an item to move it.</p> : null}
    </ThreadCard>
  );
}

type ScopeListProps = {
  title: string;
  /** The other list's title, for the move label. */
  to: string;
  items: string[];
  onMove?: (item: string) => void;
  /** Nothing here may move (the last entry in Covers). */
  locked?: boolean;
  out?: boolean;
};

/** One side of the scope; editable entries are chips. An empty side shows only while editing. */
function ScopeList({ title, to, items, onMove, locked = false, out = false }: ScopeListProps) {
  if (!items.length && !onMove) return null;
  return (
    <section className={out ? "out" : undefined} aria-label={title}>
      <h5>{title}</h5>
      <ul>
        {items.map((item) => (
          <li key={item} className={onMove ? "edit" : undefined}>
            {onMove ? (
              <button type="button" className="mk-chip mk-move" aria-label={`Move ${item} to ${to}`} disabled={locked} onClick={() => onMove(item)}>
                {item}
              </button>
            ) : item}
          </li>
        ))}
        {!items.length ? <li className="none">Nothing</li> : null}
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
