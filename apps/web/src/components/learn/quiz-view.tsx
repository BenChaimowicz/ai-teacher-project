import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PublicQuizBody, PublicQuizItem, QuizScore } from "@senoy/db/quiz";
import { Flame } from "lucide-react";
import { useCompanion } from "@/components/companion/companion-provider.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChatThread, CompanionLine } from "@/components/ui/chat-thread.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { useCountUp } from "@/components/learn/count-up.tsx";
import { requestJson } from "@/lib/api.ts";
import { cheer, confettiAt } from "@/lib/cheer.ts";
import type { QuizAnswerKey, QuizView as QuizState, StudyPayload } from "@/lib/study-types.ts";
import { cn } from "@/lib/utils";
import "@/components/learn/learn.css";

const pad = (n: number) => String(n).padStart(2, "0");
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * "4 / 5".
 * @param score - Scored result
 */
function scoreText(score: QuizScore) {
  return `${score.correct} / ${score.total}`;
}

/**
 * Reads the public Quiz body Study sends. Anything else is null.
 * @param raw - `StudyLesson.body`
 */
export function asPublicQuizBody(raw: unknown): PublicQuizBody | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  return { items: items as PublicQuizItem[] };
}

type QuestionProps = {
  item: PublicQuizItem;
  index: number;
  total: number;
  /** Right answers in a row just before this question. */
  streak: number;
  results: (boolean | undefined)[];
  chosen: string | undefined;
  locked: boolean;
  canCheck: boolean;
  result: boolean | undefined;
  /** Arrives with the item's feedback (Check, or Submit). */
  revealed: QuizAnswerKey | undefined;
  busy: boolean;
  onAnswer: (optionId: string) => void;
  onCheck: () => void;
};

/**
 * One question card: the prompt, four answer tiles (radios), Check (per-item timing), the verdict, and
 * the right answer with why. A right answer glows green; a wrong one shakes and the right one lights up.
 */
export function QuestionCard({ item, index, total, streak, results, chosen, locked, canCheck, result, revealed, busy, onAnswer, onCheck }: QuestionProps) {
  const card = useRef<HTMLFieldSetElement>(null);
  const lastResult = useRef(result);
  const qid = `q-${item.id}`;

  useEffect(() => {
    const before = lastResult.current;
    lastResult.current = result;
    if (before !== undefined || result !== true) return;
    const tile = card.current?.querySelector(".k-tile.good");
    if (tile) {
      confettiAt(tile, { count: 22, power: 0.7 });
      cheer(tile, "right");
    }
  }, [result]);

  return (
    <fieldset ref={card} className="l-qcard" aria-labelledby={qid} aria-describedby={`quiz-result-${item.id}`}>
      <legend>
        <span className="l-qc-head" aria-hidden="true">
          <span>
            question {index + 1}/{total}
          </span>
          <span className="l-dots">
            {Array.from({ length: total }, (_, i) => (
              <i key={i} className={results[i] === true ? "good" : results[i] === false ? "miss" : i === index ? "on" : undefined} />
            ))}
          </span>
          {streak >= 2 ? (
            <span className="l-combo">
              <Flame />
              {streak} in a row
            </span>
          ) : null}
        </span>
        <span id={qid} className="l-qc-q">
          <span className="sr-only">{index + 1}. </span>
          {item.prompt}
        </span>
      </legend>
      <div className="l-qopts">
        {item.options.map((option, optionIndex) => {
          const isChosen = chosen === option.id;
          const isKey = result === false && revealed?.correctOptionId === option.id;
          const state = isChosen && result === true ? "good" : isChosen && result === false ? "miss" : isKey ? "reveal" : null;
          return (
            <label
              key={option.id}
              className={cn("k-tile", state, locked && !isChosen && !isKey && "dim")}
              style={{ "--i": optionIndex } as CSSProperties}
            >
              <input
                type="radio"
                className="l-radio"
                name={`quiz-${item.id}`}
                checked={isChosen}
                disabled={locked || busy}
                onChange={() => onAnswer(option.id)}
              />
              <span className="tt">{option.text}</span>
              {!locked ? <kbd aria-hidden="true">{optionIndex + 1}</kbd> : null}
            </label>
          );
        })}
      </div>
      <div id={`quiz-result-${item.id}`} className="l-qres">
        {result === true ? <span className="l-verdict good">✓ Correct</span> : null}
        {result === false ? <span className="l-verdict miss">✗ Not quite</span> : null}
        {canCheck ? (
          <Button size="sm" onClick={onCheck} disabled={busy}>
            Check
          </Button>
        ) : null}
      </div>
      {revealed && result !== undefined ? (
        <div className={cn("l-why", result && "right")}>
          {result ? null : (
            <p>
              <b>Correct answer:</b> {item.options.find((option) => option.id === revealed.correctOptionId)?.text}
            </p>
          )}
          <p>{revealed.explanation}</p>
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * The submitted score: a count-up, pass or not, one chip per question, and Retake.
 */
export function ScoreCard({ score, passed, results, busy, onRetake, celebrate }: { score: QuizScore; passed: boolean; results: boolean[]; busy: boolean; onRetake: () => void; celebrate: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  const shown = useCountUp(score.correct, 700, 150);
  const needed = Math.ceil(score.total * 0.7);

  useEffect(() => {
    if (!celebrate || !passed || !card.current) return;
    const el = card.current;
    const timer = window.setTimeout(() => {
      confettiAt(el, { count: 80, spread: 1.4 });
      cheer(el.querySelector(".l-sc-num"), "passed");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [celebrate, passed]);

  return (
    <div ref={card} className={cn("l-score", passed && "pass")}>
      <div className="l-sc-top">
        <div className="l-sc-num" aria-hidden="true">
          <b>{shown}</b>
          <span>/{score.total}</span>
        </div>
        <div>
          <div className="l-sc-label">{passed ? "Passed" : "Not passed yet"}</div>
          <p role="status" className="l-sc-sub">
            You scored {scoreText(score)}. {passed ? "Quiz passed." : "You need 70% to pass."}
            {passed ? "" : ` That's ${needed} of ${score.total}; try as often as you like.`}
          </p>
        </div>
      </div>
      <div className="l-sc-res" aria-hidden="true">
        {results.map((right, index) => (
          <i key={index} className={right ? "good" : "miss"}>
            {pad(index + 1)} {right ? "✓" : "✕"}
          </i>
        ))}
      </div>
      <div className="l-sc-actions">
        <Button variant={passed ? "ghost" : "primary"} onClick={onRetake} disabled={busy}>
          Retake
        </Button>
      </div>
    </div>
  );
}

type QuizViewProps = {
  courseId: string;
  lessonId: string;
  title: string;
  lessonGoal: string;
  lessonNumber?: number;
  body: PublicQuizBody;
  onPayload: (payload: StudyPayload) => void;
  /** Next Lesson / Finish Course, shown once the Quiz is passed. */
  finish?: ReactNode;
};

/**
 * Quiz plugin screen. One question at a time in the chat-like thread; earlier ones stay above.
 * Draft until Submit, untimed, open-book. `per_item`: each question has Check, which locks it and shows
 * right or wrong; Submit waits until all are checked. `end_of_quiz`: no Check, verdicts after Submit.
 * The server grades and keeps the answer key; it reaches the browser only through Show answer.
 */
export function QuizView({ courseId, lessonId, title, lessonGoal, lessonNumber, body, onPayload, finish }: QuizViewProps) {
  const [view, setView] = useState<QuizState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const { say } = useCompanion();
  const toast = useToast();
  const thread = useRef<HTMLDivElement>(null);
  const shownBefore = useRef<number | null>(null);

  const base = `/api/courses/${courseId}/lessons/${lessonId}/quiz`;

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError(null);
    setJustSubmitted(false);
    shownBefore.current = null;
    requestJson<{ quiz: QuizState }>(base, "GET", undefined, "Could not load Quiz")
      .then((json) => {
        if (!cancelled) setView(json.quiz);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load Quiz");
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  /**
   * Runs one Quiz write and applies the returned state.
   * @param run - The write
   */
  async function write(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Shows the choice at once, saves it, and rolls back if the save fails.
   * @param itemId - Quiz item
   * @param optionId - Chosen option
   */
  const answer = (itemId: string, optionId: string) =>
    write(async () => {
      const before = view;
      if (before) {
        const draft = before.attempt?.status === "draft" ? before.attempt : null;
        setView({
          ...before,
          attempt: {
            status: "draft",
            answers: { ...draft?.answers, [itemId]: { optionId, checked: false } },
            results: draft?.results ?? {},
            answerKeys: draft?.answerKeys ?? {},
            score: null,
          },
        });
      }
      try {
        const json = await requestJson<{ quiz: QuizState }>(`${base}/answers/${itemId}`, "PUT", { optionId }, "Could not save answer");
        setView(json.quiz);
      } catch (caught: unknown) {
        setView(before);
        throw caught;
      }
    });

  const check = (itemId: string) =>
    write(async () => {
      const json = await requestJson<{ quiz: QuizState }>(`${base}/answers/${itemId}/check`, "POST", undefined, "Could not check answer");
      setView(json.quiz);
      const right = json.quiz.attempt?.results[itemId];
      if (right === false) say("That one's worth a second look.");
    });

  const submit = () =>
    write(async () => {
      const json = await requestJson<{ quiz: QuizState; study: StudyPayload }>(`${base}/submit`, "POST", undefined, "Could not submit Quiz");
      setView(json.quiz);
      setJustSubmitted(true);
      onPayload(json.study);
      const score = json.quiz.attempt?.score;
      if (score && json.quiz.passed && score.correct / score.total >= 0.7) {
        toast({ title: "Quiz passed", body: `${scoreText(score)} · ${title}`, tone: "celebrate" });
        say(`${score.correct} of ${score.total}. Good work.`, "cheer");
      } else {
        say("Close. Have another look and try again whenever you like.");
      }
    });

  const retake = () =>
    write(async () => {
      const json = await requestJson<{ quiz: QuizState }>(`${base}/retake`, "POST", undefined, "Could not start a retake");
      setJustSubmitted(false);
      shownBefore.current = null;
      setView(json.quiz);
    });

  const items = body.items;
  const attempt = view?.attempt ?? null;
  const submitted = attempt?.status === "submitted";
  const perItem = view?.feedbackTiming === "per_item";
  const answers = attempt?.answers ?? {};
  const results = attempt?.results ?? {};
  const done = (id: string) => Boolean(answers[id] && (!perItem || answers[id]?.checked));
  const firstOpen = items.findIndex((item) => !done(item.id));
  const shown = submitted || firstOpen < 0 ? items.length : firstOpen + 1;
  const answered = items.filter((item) => answers[item.id]).length;
  const canSubmit = Boolean(view) && !submitted && items.every((item) => done(item.id));
  const resultList = items.map((item) => results[item.id]);
  const current = !submitted && firstOpen >= 0 ? items[firstOpen] : undefined;

  /* bring a newly shown question into view (not on first load) */
  useEffect(() => {
    if (!view) return;
    const before = shownBefore.current;
    shownBefore.current = shown;
    if (before === null || shown <= before) return;
    const cards = thread.current?.querySelectorAll(".l-qcard");
    cards?.[shown - 1]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [shown, view]);

  /* number keys pick an answer on the current question */
  const keyRef = useRef<(n: number) => void>(() => undefined);
  keyRef.current = (n: number) => {
    if (!current || busy) return;
    if (answers[current.id]?.checked) return;
    const option = current.options[n - 1];
    if (option) void answer(current.id, option.id);
  };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && (target as HTMLInputElement).type !== "radio")) return;
      if (document.querySelector(".k-dialog")) return;
      const n = Number(event.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      event.preventDefault();
      keyRef.current(n);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* a small word from the companion on a run of right answers */
  const checkedRight = resultList.filter((value) => value === true).length;
  useEffect(() => {
    if (submitted || !perItem) return;
    let streak = 0;
    for (const value of resultList) {
      if (value === undefined) break;
      streak = value ? streak + 1 : 0;
    }
    if (streak === 3) say("Three in a row.", "cheer");
    if (streak === 5) say("Five for five.", "cheer");
  }, [checkedRight]);

  const count = NUMBER_WORDS[items.length] ?? String(items.length);

  return (
    <div className="l-quiz">
      <header className="l-lhead">
        <p className="l-kicker">{lessonNumber ? `lesson ${pad(lessonNumber)} · quiz` : "quiz"}</p>
        <h1>{title}</h1>
        <p className="learn">{lessonGoal}</p>
        <p className="l-meta">
          <span>
            {items.length} questions
          </span>
          <span aria-hidden="true">·</span>
          <span>untimed</span>
          <span aria-hidden="true">·</span>
          <span>open-book: earlier lessons stay open</span>
          <span aria-hidden="true">·</span>
          <span>pass with 70%</span>
        </p>
        {view?.best ? (
          <p className="l-best">
            Best score: <b>{scoreText(view.best)}</b>
            {view.passed ? " · Passed" : " · Not passed yet"}
          </p>
        ) : null}
      </header>

      {!view ? (
        error ? (
          <p role="alert" className="l-error">
            {error}
          </p>
        ) : (
          <p className="l-best">Loading…</p>
        )
      ) : (
        <div ref={thread}>
          <ChatThread label="Quiz">
            <CompanionLine>
              {perItem
                ? `${count[0]!.toUpperCase()}${count.slice(1)} questions, one at a time. Pick an answer, then Check it.`
                : `${count[0]!.toUpperCase()}${count.slice(1)} questions, one at a time. You'll see how you did after you submit.`}{" "}
              <span className="faint">No timer.</span>
            </CompanionLine>
            {items.slice(0, shown).map((item, index) => {
              const chosen = answers[item.id];
              let streak = 0;
              for (let i = index - 1; i >= 0 && resultList[i] === true; i -= 1) streak += 1;
              return (
                <QuestionCard
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  streak={streak}
                  results={resultList}
                  chosen={chosen?.optionId}
                  locked={submitted || Boolean(chosen?.checked)}
                  canCheck={!submitted && perItem && Boolean(chosen) && !chosen?.checked}
                  result={results[item.id]}
                  revealed={attempt?.answerKeys?.[item.id]}
                  busy={busy}
                  onAnswer={(optionId) => void answer(item.id, optionId)}
                  onCheck={() => void check(item.id)}
                />
              );
            })}
            {canSubmit ? <CompanionLine key="all-done">That's all {count}. Submit when you're ready.</CompanionLine> : null}
            {submitted && attempt?.score ? (
              <>
                <ScoreCard
                  score={attempt.score}
                  passed={attempt.score.correct / attempt.score.total >= 0.7}
                  results={items.map((item) => results[item.id] === true)}
                  busy={busy}
                  onRetake={() => void retake()}
                  celebrate={justSubmitted}
                />
                <CompanionLine key="after">
                  {view.passed
                    ? attempt.score.correct / attempt.score.total >= 0.7
                      ? "All clear."
                      : "Your best score still counts, so this one stays passed."
                    : "Close. The right answers are marked above. Try again whenever you like."}
                </CompanionLine>
              </>
            ) : null}
          </ChatThread>
        </div>
      )}

      {view && error ? (
        <p role="alert" className="l-error">
          {error}
        </p>
      ) : null}

      {view && !submitted ? (
        <div className="l-submit-bar">
          <span className="info">
            {answered} of {items.length} answered{perItem ? ` · ${items.filter((item) => answers[item.id]?.checked).length} checked` : ""}
          </span>
          <Button onClick={() => void submit()} disabled={busy || !canSubmit}>
            Submit
          </Button>
        </div>
      ) : null}

      {view?.passed && submitted ? finish : null}
    </div>
  );
}
