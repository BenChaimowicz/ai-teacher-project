import { useEffect, useState } from "react";
import type { PublicQuizBody, PublicQuizItem, QuizScore } from "@senoy/db/quiz";
import { Button } from "@/components/ui/button.tsx";
import { requestJson } from "@/lib/api.ts";
import type { QuizAnswerKey, QuizView, StudyPayload } from "@/lib/study-types.ts";
import { cn } from "@/lib/utils";
import type { LessonPlayProps } from "@/teaching-methods/register.ts";

/**
 * Reads the public Quiz body Study sends. Anything else is null.
 * @param raw - `StudyLesson.body`
 */
function asPublicQuizBody(raw: unknown): PublicQuizBody | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  return { items: items as PublicQuizItem[] };
}

/**
 * "4 / 5".
 * @param score - Scored result
 */
function scoreText(score: QuizScore) {
  return `${score.correct} / ${score.total}`;
}

type ItemProps = {
  item: PublicQuizItem;
  index: number;
  chosen: string | undefined;
  locked: boolean;
  canCheck: boolean;
  result: boolean | undefined;
  answersOpen: boolean;
  revealed: QuizAnswerKey | undefined;
  busy: boolean;
  onAnswer: (optionId: string) => void;
  onCheck: () => void;
  onReveal: () => void;
};

/**
 * One Quiz item: options, Check (per-item timing), right/wrong, and Show answer on a wrong item.
 */
function QuizItemView({
  item,
  index,
  chosen,
  locked,
  canCheck,
  result,
  answersOpen,
  revealed,
  busy,
  onAnswer,
  onCheck,
  onReveal,
}: ItemProps) {
  return (
    <fieldset className="mt-8 rounded-lg border border-border p-4" aria-describedby={`quiz-result-${item.id}`}>
      <legend className="px-1 text-sm font-medium">
        {index + 1}. {item.prompt}
      </legend>
      <div className="mt-2 grid gap-2">
        {item.options.map((option) => {
          const isChosen = chosen === option.id;
          const isKey = revealed?.correctOptionId === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                locked ? "cursor-default" : "cursor-pointer hover:bg-accent/50",
                isChosen ? "border-ring bg-accent" : "border-border",
                isKey && "border-emerald-500",
              )}
            >
              <input
                type="radio"
                name={`quiz-${item.id}`}
                checked={isChosen}
                disabled={locked || busy}
                onChange={() => onAnswer(option.id)}
                className="mt-0.5"
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>

      <div id={`quiz-result-${item.id}`} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {result === true ? <span className="font-medium text-emerald-400">✓ Correct</span> : null}
        {result === false ? <span className="font-medium text-red-400">✗ Not quite</span> : null}
        {canCheck ? (
          <Button type="button" size="sm" variant="secondary" onClick={onCheck} disabled={busy}>
            Check
          </Button>
        ) : null}
        {result === false && answersOpen && !revealed ? (
          <Button type="button" size="sm" variant="ghost" onClick={onReveal} disabled={busy}>
            Show answer
          </Button>
        ) : null}
      </div>

      {revealed ? (
        <div className="mt-3 rounded-md bg-accent/40 p-3 text-sm">
          <p>
            <span className="font-medium">Correct answer:</span>{" "}
            {item.options.find((option) => option.id === revealed.correctOptionId)?.text}
          </p>
          <p className="mt-1 text-muted-foreground">{revealed.explanation}</p>
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * Quiz-plugin `render`. Draft until Submit, untimed, open-book. Feedback timing comes from the attempt;
 * the server grades and holds the answer key. Retakes reuse the same items; best score is kept.
 */
export function QuizLessonPlay({ courseId, lesson, onPayload }: LessonPlayProps) {
  const body = asPublicQuizBody(lesson.body);
  const [view, setView] = useState<QuizView | null>(null);
  const [revealed, setRevealed] = useState<Record<string, QuizAnswerKey>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/courses/${courseId}/lessons/${lesson.id}/quiz`;

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setRevealed({});
    setError(null);
    requestJson<{ quiz: QuizView }>(base, "GET", undefined, "Could not load Quiz")
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
            score: null,
          },
        });
      }
      try {
        const json = await requestJson<{ quiz: QuizView }>(`${base}/answers/${itemId}`, "PUT", { optionId }, "Could not save answer");
        setView(json.quiz);
      } catch (caught: unknown) {
        setView(before);
        throw caught;
      }
    });

  const check = (itemId: string) =>
    write(async () => {
      const json = await requestJson<{ quiz: QuizView }>(`${base}/answers/${itemId}/check`, "POST", undefined, "Could not check answer");
      setView(json.quiz);
    });

  const reveal = (itemId: string) =>
    write(async () => {
      const json = await requestJson<{ answer: QuizAnswerKey }>(`${base}/answers/${itemId}/reveal`, "POST", undefined, "Could not show answer");
      setRevealed((current) => ({ ...current, [itemId]: json.answer }));
    });

  const submit = () =>
    write(async () => {
      const json = await requestJson<{ quiz: QuizView; study: StudyPayload }>(`${base}/submit`, "POST", undefined, "Could not submit Quiz");
      setView(json.quiz);
      onPayload(json.study);
    });

  const retake = () =>
    write(async () => {
      const json = await requestJson<{ quiz: QuizView }>(`${base}/retake`, "POST", undefined, "Could not start a retake");
      setRevealed({});
      setView(json.quiz);
    });

  if (!body) return <p className="mt-8 text-sm text-red-400">This Quiz has no questions.</p>;
  if (!view) {
    return error ? (
      <p className="mt-8 text-sm text-red-400">{error}</p>
    ) : (
      <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
    );
  }

  const attempt = view.attempt;
  const submitted = attempt?.status === "submitted";
  const perItem = view.feedbackTiming === "per_item";
  const answers = attempt?.answers ?? {};
  const results = attempt?.results ?? {};
  const canSubmit =
    !submitted && body.items.every((item) => answers[item.id] && (!perItem || answers[item.id]?.checked));

  return (
    <div>
      <p className="mt-6 text-sm text-muted-foreground">
        {body.items.length} questions · untimed · you can reopen earlier Lessons while you work.{" "}
        {perItem ? "Check each answer as you go." : "Feedback appears after you submit."} Pass with 70%.
      </p>
      {view.best ? (
        <p className="mt-2 text-sm">
          Best score: <span className="font-medium">{scoreText(view.best)}</span>
          {view.passed ? " · Passed" : " · Not passed yet"}
        </p>
      ) : null}

      {body.items.map((item, index) => {
        const chosen = answers[item.id];
        return (
          <QuizItemView
            key={item.id}
            item={item}
            index={index}
            chosen={chosen?.optionId}
            locked={submitted || Boolean(chosen?.checked)}
            canCheck={!submitted && perItem && Boolean(chosen) && !chosen?.checked}
            result={results[item.id]}
            answersOpen={view.answersOpen}
            revealed={revealed[item.id]}
            busy={busy}
            onAnswer={(optionId) => void answer(item.id, optionId)}
            onCheck={() => void check(item.id)}
            onReveal={() => void reveal(item.id)}
          />
        );
      })}

      {error ? <p className="mt-6 text-sm text-red-400">{error}</p> : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {submitted && attempt?.score ? (
          <>
            <p role="status" className="text-sm">
              You scored <span className="font-medium">{scoreText(attempt.score)}</span>.{" "}
              {view.passed ? "Quiz passed." : "You need 70% to pass."}
            </p>
            <Button type="button" onClick={() => void retake()} disabled={busy}>
              Retake
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => void submit()} disabled={busy || !canSubmit}>
            Submit
          </Button>
        )}
      </div>
    </div>
  );
}
