import { ArrowRight, Home, MoreHorizontal, Pencil, Play, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanion, useCompanionLines } from "@/components/companion/companion-provider.tsx";
import { FlowTitle, ThreadEnd, WorkingLine } from "@/components/make-course/flow.tsx";
import { ProfileAsk } from "@/components/make-course/profile-ask.tsx";
import {
  PROFILE_QUESTIONS,
  echoText,
  fromAnswers,
  oneLiner,
  toAnswers,
  type FieldAnswer,
  type ProfileDraft,
  type ProfileField,
} from "@/components/make-course/profile-questions.tsx";
import { ProfileSettingsCard, ProfileSummaryPanel } from "@/components/make-course/profile-summary.tsx";
import { ShellActions, ShellTitle } from "@/components/shell/app-shell.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChatThread, LearnerEcho, CompanionLine, ThreadCard } from "@/components/ui/chat-thread.tsx";
import { ConfirmDialog } from "@/components/ui/dialog.tsx";
import { Jongi } from "@/components/companion/jongi.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { confettiAt } from "@/lib/cheer.ts";
import type { TeachingProfileAnswers } from "@senoy/db/teaching-profile";

const LINES = [
  "A few quick taps, then I'll know how to teach you.",
  "No right answers here.",
  "You can change any of this later.",
  "Short or long, both are fine. It's your call.",
];

/** Spec §4.1 intro copy: the guarantee, said once, positively. */
const INTRO_GUARANTEE = "No right answers. You can skip any question and change any of this later.";

/** Which answers apply when (show-time fields change on screen right away). */
const APPLY_NOTE = "Pacing and quiz answers change right away, everywhere. The rest applies to courses you start next; courses you already have aren't rewritten.";

/** One past line in the thread. */
type Entry = { key: string; who: "companion" | "me"; text: ReactNode; continued?: boolean };

/** Where the conversation is. */
type Step =
  | { kind: "intro" }
  | { kind: "ask"; index: number }
  | { kind: "redo"; field: ProfileField }
  | { kind: "pick-change" }
  | { kind: "saving" }
  | { kind: "save-failed" }
  | { kind: "done"; celebrate: boolean }
  | { kind: "updated" }
  | { kind: "idle" };

/**
 * "How you like to learn" (SEN-56): a short conversation of seven tap-to-choose questions with a live summary, or,
 * once saved, the settings with a change button per line. Saving keeps the SEN-33 answer shapes.
 */
export function TeachingProfilePage() {
  const { loading, error, present, record, save, reset, refresh } = useTeachingProfile();
  useCompanionLines(LINES);
  // A fresh conversation only after Reset; saving keeps the one in progress (it shows what was just saved).
  const [epoch, setEpoch] = useState(0);
  const wasPresent = useRef(present);
  useEffect(() => {
    if (wasPresent.current && !present) setEpoch((n) => n + 1);
    wasPresent.current = present;
  }, [present]);

  if (loading) return <PageLoader label="Loading how you like to learn…" />;
  if (error) {
    return (
      <div className="mk-page">
        <ErrorState title="That didn't load" actions={<Button onClick={() => void refresh()}>Try again</Button>}>
          I couldn't load how you like to learn. Nothing is lost.
        </ErrorState>
      </div>
    );
  }
  return <ProfileConversation key={epoch} present={present} saved={record?.answers ?? null} save={save} reset={reset} />;
}

type ConversationProps = {
  present: boolean;
  saved: TeachingProfileAnswers | null;
  save: ReturnType<typeof useTeachingProfile>["save"];
  reset: ReturnType<typeof useTeachingProfile>["reset"];
};

/**
 * The conversation itself. Mounted fresh when the Profile goes from missing to saved (or back, after Reset).
 */
function ProfileConversation({ present, saved, save, reset }: ConversationProps) {
  const navigate = useNavigate();
  const { say } = useCompanion();
  const toast = useToast();
  /** First run asks everything; returning shows the settings, and Run through it again asks everything as a reassess. */
  const [mode, setMode] = useState<"first" | "returning" | "reassess">(present ? "returning" : "first");
  const [draft, setDraft] = useState<ProfileDraft>(() => (saved ? fromAnswers(saved) : {}));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [step, setStep] = useState<Step>(present ? { kind: "idle" } : { kind: "intro" });
  const [fresh, setFresh] = useState<ProfileField | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  /** What the next save writes, so Try again sends the same thing. */
  const pending = useRef<{ draft: ProfileDraft; action: "save" | "reassess"; after: Step } | null>(null);
  const summaryCard = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  /** Every answer is in and saved, so summary lines can be tapped to change them. */
  const [complete, setComplete] = useState(present);

  /** Adds past lines to the thread. */
  function push(...lines: Omit<Entry, "key">[]) {
    setEntries((current) => [...current, ...lines.map((line) => ({ ...line, key: `e${counter.current++}` }))]);
  }

  /** Writes answers; on success moves to `after`. */
  async function commit(nextDraft: ProfileDraft, action: "save" | "reassess", after: Step) {
    pending.current = { draft: nextDraft, action, after };
    setStep({ kind: "saving" });
    try {
      await save(toAnswers(nextDraft, saved), action);
      pending.current = null;
      setComplete(true);
      setStep(after);
    } catch {
      setStep({ kind: "save-failed" });
    }
  }

  /** Records one answer from the full run and asks the next, or saves after the last. */
  async function answerInRun(index: number, answer: FieldAnswer) {
    const question = PROFILE_QUESTIONS[index]!;
    const nextDraft = { ...draft, [question.field]: answer };
    setDraft(nextDraft);
    setFresh(question.field);
    push({ who: "companion", text: <b>{question.ask}</b> }, { who: "me", text: echoText(question, answer) });
    const next = index + 1;
    if (next < PROFILE_QUESTIONS.length) {
      if (next === 3) say("Halfway there.");
      else if (next === PROFILE_QUESTIONS.length - 1) say("Last one.");
      setStep({ kind: "ask", index: next });
      return;
    }
    await commit(nextDraft, mode === "reassess" ? "reassess" : "save", { kind: "done", celebrate: true });
  }

  /** Re-asks one question and saves the change right away. */
  async function answerRedo(field: ProfileField, answer: FieldAnswer) {
    const question = PROFILE_QUESTIONS.find((candidate) => candidate.field === field)!;
    const nextDraft = { ...draft, [field]: answer };
    setDraft(nextDraft);
    setFresh(field);
    push({ who: "companion", text: <>Sure. <b>{question.ask}</b></> }, { who: "me", text: echoText(question, answer) });
    await commit(nextDraft, "save", { kind: "updated" });
  }

  /** Opens one question again, from the panel, the settings card, or Change something. */
  function startRedo(field: ProfileField) {
    if (step.kind === "saving") return;
    setMenuOpen(false);
    if (mode === "reassess" && step.kind === "ask") return;
    setStep({ kind: "redo", field });
  }

  /** Uses the defaults for everything: every question skipped (spec §4.1: skip uses the product default). */
  async function useDefaults() {
    const nextDraft: ProfileDraft = Object.fromEntries(PROFILE_QUESTIONS.map((question) => [question.field, { status: "skipped" }]));
    setDraft(nextDraft);
    await commit(nextDraft, "save", { kind: "done", celebrate: false });
  }

  function startReassess() {
    setMode("reassess");
    setComplete(false);
    setDraft({});
    setEntries([]);
    setFresh(null);
    push({ who: "companion", text: "Sure. From the top, same seven questions. Your current settings stay until the last one." });
    setStep({ kind: "ask", index: 0 });
  }

  async function confirmReset() {
    setResetBusy(true);
    setResetError(null);
    try {
      await reset();
      // The page remounts as a first run once the Profile is gone.
    } catch {
      setResetError("I couldn't reset that. Your settings are unchanged; try again.");
      setResetBusy(false);
    }
  }

  useEffect(() => {
    if (step.kind !== "done") return;
    if (step.celebrate) {
      say("Got it. I'll teach your way.", "cheer");
      const timer = window.setTimeout(() => {
        if (summaryCard.current) confettiAt(summaryCard.current, { count: 60 });
        toast({ title: "All set", body: "Your next lesson uses these.", tone: "celebrate" });
      }, 450);
      return () => window.clearTimeout(timer);
    }
    say("Defaults for now. Change them anytime.");
  }, [step, say, toast]);

  const asking = step.kind === "ask" ? step.index : null;
  const currentField = step.kind === "ask" ? PROFILE_QUESTIONS[step.index]!.field : step.kind === "redo" ? step.field : null;

  const doneTiles: OptionTile[] = useMemo(() => [
    { id: "course", label: mode === "first" ? "Make my first course" : "Make a new course", description: "Pick a topic next", icon: <Sparkles />, tone: "primary" },
    { id: "change", label: "Change something", description: "Pick a line to redo", icon: <Pencil />, tone: "quiet" },
    { id: "home", label: "Back to Home", description: "Start whenever you like", icon: <Home />, tone: "quiet" },
  ], [mode]);

  const changeTiles: OptionTile<ProfileField>[] = PROFILE_QUESTIONS.map((question) => ({
    id: question.field,
    label: question.short[0]!.toUpperCase() + question.short.slice(1),
    description: echoOrDefault(draft, question.field),
    icon: question.icon,
    value: question.field,
  }));

  /** Tiles after a single change. */
  function pickAfter(option: OptionTile) {
    if (option.id === "course") navigate("/new-course-request");
    else if (option.id === "home") navigate("/");
    else setStep({ kind: "pick-change" });
  }

  const conversation = (
    <ChatThread>
      {mode === "first" ? (
        <>
          <CompanionLine>Before your first lesson: a few quick choices about how I teach you.</CompanionLine>
          <CompanionLine continued><span className="mk-faint">{INTRO_GUARANTEE}</span></CompanionLine>
          {step.kind === "intro" ? (
            <OptionTiles
              label="Set up how you like to learn"
              options={[
                { id: "go", label: "Let's do it", description: "About a minute · 7 questions", icon: <Play />, tone: "primary" },
                { id: "defaults", label: "Use the defaults for now", description: "Good for most people. Change it anytime.", icon: <ArrowRight />, tone: "quiet" },
              ]}
              onPick={(option) => {
                if (option.id === "defaults") {
                  push({ who: "me", text: "Use the defaults for now" });
                  return useDefaults();
                }
                push({ who: "me", text: "Let's do it" });
                setStep({ kind: "ask", index: 0 });
              }}
            />
          ) : null}
        </>
      ) : null}
      {entries.map((entry) => entry.who === "me"
        ? <LearnerEcho key={entry.key}>{entry.text}</LearnerEcho>
        : <CompanionLine key={entry.key} continued={entry.continued}>{entry.text}</CompanionLine>)}

      {asking !== null ? (
        <ProfileAsk
          key={`ask-${asking}`}
          question={PROFILE_QUESTIONS[asking]!}
          lead={<span className="mk-qnum">{asking + 1} of {PROFILE_QUESTIONS.length}</span>}
          onAnswer={(answer) => answerInRun(asking, answer)}
        />
      ) : null}
      {step.kind === "redo" ? (
        <ProfileAsk
          key={`redo-${step.field}-${counter.current}`}
          question={PROFILE_QUESTIONS.find((question) => question.field === step.field)!}
          lead={<span>Sure.</span>}
          onAnswer={(answer) => answerRedo(step.field, answer)}
        />
      ) : null}
      {step.kind === "saving" ? <CompanionLine mood="think"><WorkingLine>Saving…</WorkingLine></CompanionLine> : null}
      {step.kind === "save-failed" ? (
        <>
          <CompanionLine mood="think"><span role="alert">I couldn't save that. Your answers are still here.</span></CompanionLine>
          <OptionTiles
            label="Couldn't save"
            resetKey={attempt}
            options={[{ id: "retry", label: "Try again", description: "Save the same answers", icon: <RefreshCw />, tone: "primary" }]}
            onPick={() => {
              setAttempt((n) => n + 1);
              const job = pending.current;
              if (job) return commit(job.draft, job.action, job.after);
            }}
          />
        </>
      ) : null}
      {step.kind === "done" ? (
        <>
          <CompanionLine mood={step.celebrate ? "cheer" : "idle"}>
            {step.celebrate ? "That's everything. I'll teach this way from your next lesson." : "Done. I'll use the defaults, and you can change them here anytime."}
          </CompanionLine>
          <div ref={summaryCard}>
            <ThreadCard title="In short" sub={step.celebrate ? "Tap any line on the right to change it." : undefined}>
              <p className="font-bold leading-relaxed">{oneLiner(draft) || "the usual"}</p>
            </ThreadCard>
          </div>
          <OptionTiles label="What next?" cols={3} options={doneTiles} onPick={pickAfter} />
        </>
      ) : null}
      {step.kind === "updated" ? (
        <>
          <CompanionLine>Updated. <span className="mk-faint">{APPLY_NOTE}</span></CompanionLine>
          <OptionTiles
            label="What next?"
            cols={3}
            options={mode === "first" ? doneTiles : [
              { id: "change", label: "Change something else", icon: <Pencil />, tone: "quiet" },
              { id: "home", label: "Back to Home", icon: <Home />, tone: "quiet" },
            ]}
            onPick={pickAfter}
          />
        </>
      ) : null}
      {step.kind === "pick-change" ? (
        <>
          <CompanionLine typing delayMs={300}>Which one?</CompanionLine>
          <OptionTiles label="Which one to change?" options={changeTiles} onPick={(option) => startRedo(option.value!)} />
        </>
      ) : null}
      <ThreadEnd watch={`${entries.length}|${step.kind}|${asking}`} />
    </ChatThread>
  );

  const progress = asking !== null ? (
    <ShellActions>
      <div className="mk-qprog" aria-label={`Question ${asking + 1} of ${PROFILE_QUESTIONS.length}`}>
        <span><b>{asking + 1}</b> of {PROFILE_QUESTIONS.length}</span>
        <FlowStepsSegments index={asking} />
      </div>
    </ShellActions>
  ) : null;

  if (mode === "returning") {
    return (
      <div className="mk-ret">
        <ShellTitle><FlowTitle>How you like to learn</FlowTitle></ShellTitle>
        <div className="head">
          <span className="av"><Jongi size={46} tile="round" /></span>
          <div>
            <h1>How you like to learn</h1>
            <p>{oneLiner(draft) || "The usual settings."}</p>
          </div>
        </div>
        <ProfileSettingsCard draft={draft} fresh={fresh} busy={step.kind === "saving"} onChange={startRedo} />
        <p className="mk-note mt-3">{APPLY_NOTE}</p>
        <div className="mk-ret-actions">
          <OptionTiles
            className="mk-again"
            flush
            cols={1}
            label="Run through it again"
            keyboard={false}
            options={[{ id: "again", label: "Run through it again", description: "All seven questions · about a minute", icon: <RefreshCw /> }]}
            onPick={startReassess}
          />
          <div className="relative">
            <Button variant="ghost" size="icon" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              <MoreHorizontal />
            </Button>
            {menuOpen ? (
              <div className="k-card flat absolute right-0 bottom-12 z-10 w-60 p-1.5" role="menu">
                <button type="button" role="menuitem" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--a-soft)]" onClick={() => { setMenuOpen(false); setResetOpen(true); }}>
                  Reset to defaults
                  <small className="mt-0.5 block font-mono text-[0.62rem] text-[var(--faint)]">deletes your answers</small>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {entries.length || step.kind !== "idle" ? conversation : null}
        <ConfirmDialog
          open={resetOpen}
          title="Reset to defaults?"
          body="This deletes your answers. Courses you already have aren't rewritten. New courses wait until you set this up again."
          confirmLabel="Reset"
          danger
          busy={resetBusy}
          extra={resetError ? <p role="alert" className="text-sm text-[var(--miss)]">{resetError}</p> : undefined}
          onConfirm={() => void confirmReset()}
          onCancel={() => { setResetOpen(false); setResetError(null); }}
        />
      </div>
    );
  }

  return (
    <div className="mk-profile">
      <ShellTitle><FlowTitle>How you like to learn</FlowTitle></ShellTitle>
      {progress}
      {conversation}
      <div className="mk-panel-col">
        <ProfileSummaryPanel draft={draft} current={currentField} fresh={fresh} onChange={complete && step.kind !== "saving" ? startRedo : null} />
      </div>
    </div>
  );
}

/** Segments for the question progress in the top bar. */
function FlowStepsSegments({ index }: { index: number }) {
  return (
    <span className="k-segs" aria-hidden="true">
      {PROFILE_QUESTIONS.map((question, at) => <i key={question.field} className={at < index ? "done" : at === index ? "now" : undefined} />)}
    </span>
  );
}

/** The answer's echo, or the default's words when not answered. */
function echoOrDefault(draft: ProfileDraft, field: ProfileField) {
  const question = PROFILE_QUESTIONS.find((candidate) => candidate.field === field)!;
  const answer = draft[field];
  return answer ? echoText(question, answer) : question.defaultChip;
}
