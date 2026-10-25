import { ArrowRight, Check, SkipForward, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ReadingSupport } from "@senoy/db/teaching-profile";
import { NibblesLine } from "@/components/ui/chat-thread.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import {
  NO_PREFERENCE_ICON,
  SKIP_ICON,
  preference,
  readingNeed,
  type FieldAnswer,
  type ProfileQuestion,
} from "@/components/make-course/profile-questions.tsx";
import { cn } from "@/lib/utils";

type AskProps = {
  question: ProfileQuestion;
  /** Shown before the question, e.g. "3 of 7" or "Sure.". */
  lead?: ReactNode;
  onAnswer: (answer: FieldAnswer) => void | Promise<void>;
  /** Re-enables the tiles (e.g. after a failed save). */
  resetKey?: unknown;
};

/**
 * Asks one "How you like to learn" question: the companion's line, then big tiles right under it. Every preference
 * offers No preference and Skip (spec §4.1).
 */
export function ProfileAsk({ question, lead, onAnswer, resetKey }: AskProps) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <NibblesLine typing delayMs={420} onShown={() => setShown(true)}>
        <span className="mk-qhead">{lead}<b>{question.ask}</b></span>
      </NibblesLine>
      {shown ? (
        question.multi ? (
          <MultiTiles question={question} onAnswer={onAnswer} resetKey={resetKey} />
        ) : (
          <OptionTiles
            label={question.ask}
            resetKey={resetKey}
            cols={2}
            options={singleTiles(question)}
            onPick={(option) => onAnswer(preference(option.id) as FieldAnswer)}
          />
        )
      ) : null}
    </>
  );
}

/**
 * The tiles for a single-select question: its choices, No preference, and Skip.
 * @param question - The question
 */
function singleTiles(question: ProfileQuestion): OptionTile[] {
  return [
    ...question.choices.map((choice) => ({ id: choice.value, label: choice.label, description: choice.description, icon: choice.icon ?? question.icon })),
    {
      id: "no_preference", label: question.noPreference?.label ?? "No preference", description: question.noPreference?.description ?? "Use the default",
      icon: NO_PREFERENCE_ICON, tone: "quiet" as const,
    },
    { id: "skipped", label: "Skip this one", description: "Same as the default", icon: SKIP_ICON, tone: "quiet" as const },
  ];
}

/**
 * Q2's multi-select: toggle any of the needs, then That's it. None of these and Skip are their own answers, so they
 * never mix with a need (spec §4.1 Q2).
 */
function MultiTiles({ question, onAnswer, resetKey }: { question: ProfileQuestion; onAnswer: AskProps["onAnswer"]; resetKey?: unknown }) {
  const [picked, setPicked] = useState<ReadingSupport[]>([]);
  const [locked, setLocked] = useState(false);
  useEffect(() => setLocked(false), [resetKey]);

  function toggle(flag: ReadingSupport) {
    setPicked((current) => (current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]));
  }

  async function finish(value: ReadingSupport[] | "none" | "skipped") {
    if (locked) return;
    setLocked(true);
    await onAnswer(readingNeed(value));
  }

  return (
    <div className={cn("mk-multi", locked && "locked")} role="group" aria-label={question.ask}>
      {question.choices.map((choice, index) => {
        const on = picked.includes(choice.value as ReadingSupport);
        return (
          <button
            key={choice.value}
            type="button"
            className="k-tile"
            style={{ "--i": index } as CSSProperties}
            aria-pressed={on}
            disabled={locked}
            onClick={() => toggle(choice.value as ReadingSupport)}
          >
            <span className="box" aria-hidden="true"><Check /></span>
            <span><span className="tt">{choice.label}</span></span>
          </button>
        );
      })}
      <div className="acts">
        <button type="button" className="k-tile primary" style={{ "--i": 3 } as CSSProperties} disabled={locked} onClick={() => void finish(picked.length ? picked : "none")}>
          <span className="ti" aria-hidden="true"><ArrowRight /></span>
          <span><span className="tt">That's it</span><span className="td">{picked.length ? `${picked.length} picked` : "Pick any above"}</span></span>
        </button>
        <button type="button" className="k-tile quiet" style={{ "--i": 4 } as CSSProperties} disabled={locked} onClick={() => void finish("none")}>
          <span className="ti" aria-hidden="true"><X /></span>
          <span><span className="tt">None of these</span><span className="td">Nothing extra needed</span></span>
        </button>
        <button type="button" className="k-tile quiet" style={{ "--i": 5 } as CSSProperties} disabled={locked} onClick={() => void finish("skipped")}>
          <span className="ti" aria-hidden="true"><SkipForward /></span>
          <span><span className="tt">Skip this one</span><span className="td">Same as the default</span></span>
        </button>
      </div>
    </div>
  );
}
