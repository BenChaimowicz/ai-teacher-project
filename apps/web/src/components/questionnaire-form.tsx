import type { ReactNode } from "react";
import type {
  ContentScope,
  DeclaredNeed,
  ExplanationOrderChoice,
  FeedbackDepth,
  FeedbackTiming,
  InstructionLanguageAnswer,
  ProfileAnswer,
  QuizCadence,
  ReadingSupport,
  SectionAdvance,
  TeachingProfileAnswers,
} from "@senoy/db/teaching-profile";
import { ChoiceCard } from "@/components/choice-card.tsx";
import {
  CADENCE_OPTIONS,
  DEPTH_OPTIONS,
  LANGUAGE_NOT_LISTED_DISCLAIMER,
  LANGUAGE_OPTIONS,
  NONE_OF_THESE,
  NO_PREFERENCE,
  NO_PREFERENCE_ORDER,
  ORDER_OPTIONS,
  PACING_OPTIONS,
  PREFER_NOT,
  Q1,
  Q2,
  Q3,
  Q4,
  Q5,
  Q6,
  Q7,
  Q8,
  SCOPE_OPTIONS,
  SUPPORT_OPTIONS,
  TIMING_OPTIONS,
} from "@/lib/teaching-profile-copy.ts";

type Unset = { status: "unset" };

/** Draft answers while Editing. Unset becomes skipped on Save. */
export type EditorAnswers = {
  instructionLanguage: InstructionLanguageAnswer | Unset;
  requiredReadingSupports: DeclaredNeed<ReadingSupport[]> | Unset;
  contentScope: ProfileAnswer<ContentScope> | Unset;
  sectionAdvance: ProfileAnswer<SectionAdvance> | Unset;
  explanationOrder: ProfileAnswer<ExplanationOrderChoice> | Unset;
  quizCadence: ProfileAnswer<QuizCadence> | Unset;
  feedbackTiming: ProfileAnswer<FeedbackTiming> | Unset;
  feedbackDepth: ProfileAnswer<FeedbackDepth> | Unset;
};

/**
 * Empty questionnaire. Nothing is selected, including prefer-not-to-answer.
 */
export function blankEditorAnswers(): EditorAnswers {
  return {
    instructionLanguage: { status: "unset" },
    requiredReadingSupports: { status: "unset" },
    contentScope: { status: "unset" },
    sectionAdvance: { status: "unset" },
    explanationOrder: { status: "unset" },
    quizCadence: { status: "unset" },
    feedbackTiming: { status: "unset" },
    feedbackDepth: { status: "unset" },
  };
}

/**
 * Prefills the editor from a saved Teaching Profile.
 * @param answers - Stored answers
 */
export function editorFromSaved(answers: TeachingProfileAnswers): EditorAnswers {
  return { ...answers };
}

/**
 * Maps unset items to skipped so missing answers are recorded, not inferred.
 * @param draft - Editor state
 */
export function answersFromEditor(draft: EditorAnswers): TeachingProfileAnswers {
  return {
    instructionLanguage:
      draft.instructionLanguage.status === "unset"
        ? { status: "skipped" }
        : draft.instructionLanguage,
    requiredReadingSupports:
      draft.requiredReadingSupports.status === "unset"
        ? { status: "skipped" }
        : draft.requiredReadingSupports,
    contentScope: draft.contentScope.status === "unset" ? { status: "skipped" } : draft.contentScope,
    sectionAdvance:
      draft.sectionAdvance.status === "unset" ? { status: "skipped" } : draft.sectionAdvance,
    explanationOrder:
      draft.explanationOrder.status === "unset" ? { status: "skipped" } : draft.explanationOrder,
    quizCadence: draft.quizCadence.status === "unset" ? { status: "skipped" } : draft.quizCadence,
    feedbackTiming:
      draft.feedbackTiming.status === "unset" ? { status: "skipped" } : draft.feedbackTiming,
    feedbackDepth: draft.feedbackDepth.status === "unset" ? { status: "skipped" } : draft.feedbackDepth,
  };
}

type QuestionnaireFormProps = {
  value: EditorAnswers;
  onChange: (next: EditorAnswers) => void;
};

type QuestionShellProps = {
  kicker: string;
  title: string;
  prompt: string;
  children: ReactNode;
};

/**
 * One numbered question block.
 */
function QuestionShell({ kicker, title, prompt, children }: QuestionShellProps) {
  return (
    <fieldset className="rounded-xl border border-border bg-card/40 p-5">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {kicker} · {title}
      </legend>
      <p className="mt-2 text-sm font-medium">{prompt}</p>
      <div className="mt-3 grid gap-2">{children}</div>
    </fieldset>
  );
}

/**
 * Sets one preference to selected, no preference, skip, or leaves others.
 * @typeParam T - Allowed values
 */
function setPref<T>(status: "selected", value: T): ProfileAnswer<T>;
function setPref<T>(status: "no_preference" | "skipped"): ProfileAnswer<T>;
function setPref<T>(status: "selected" | "no_preference" | "skipped", value?: T): ProfileAnswer<T> {
  if (status === "selected") return { status: "selected", value: value as T };
  return { status };
}

/**
 * Editable Q1–Q8. Viewing is a different component.
 */
export function QuestionnaireForm({ value, onChange }: QuestionnaireFormProps) {
  const supports = value.requiredReadingSupports;
  const selectedFlags = supports.status === "declared" ? supports.value : [];

  /**
   * Toggles one Q2 flag. Clears none-declared and skip.
   */
  function toggleSupport(flag: ReadingSupport) {
    const next = selectedFlags.includes(flag)
      ? selectedFlags.filter((item) => item !== flag)
      : [...selectedFlags, flag];
    onChange({
      ...value,
      requiredReadingSupports:
        next.length === 0 ? { status: "unset" } : { status: "declared", value: next },
    });
  }

  return (
    <div className="grid gap-4">
      <QuestionShell kicker="Q1" title={Q1.title} prompt={Q1.prompt}>
        {LANGUAGE_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            name="q1"
            type="radio"
            checked={value.instructionLanguage.status === "declared" && value.instructionLanguage.value === option.value}
            onChange={() =>
              onChange({ ...value, instructionLanguage: { status: "declared", value: option.value } })
            }
          >
            {option.label}
          </ChoiceCard>
        ))}
        <ChoiceCard
          name="q1"
          type="radio"
          checked={value.instructionLanguage.status === "skipped"}
          onChange={() => onChange({ ...value, instructionLanguage: { status: "skipped" } })}
        >
          {PREFER_NOT}
        </ChoiceCard>
        {value.instructionLanguage.status === "declared" && value.instructionLanguage.value === "not_listed" ? (
          <p className="rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
            {LANGUAGE_NOT_LISTED_DISCLAIMER}
          </p>
        ) : null}
      </QuestionShell>

      <QuestionShell kicker="Q2" title={Q2.title} prompt={Q2.prompt}>
        {SUPPORT_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            name={`q2-${option.value}`}
            type="checkbox"
            checked={selectedFlags.includes(option.value)}
            onChange={() => toggleSupport(option.value)}
          >
            {option.label}
          </ChoiceCard>
        ))}
        <ChoiceCard
          name="q2-none"
          type="radio"
          checked={supports.status === "none_declared"}
          onChange={() => onChange({ ...value, requiredReadingSupports: { status: "none_declared" } })}
        >
          {NONE_OF_THESE}
        </ChoiceCard>
        <ChoiceCard
          name="q2-skip"
          type="radio"
          checked={supports.status === "skipped"}
          onChange={() => onChange({ ...value, requiredReadingSupports: { status: "skipped" } })}
        >
          {PREFER_NOT}
        </ChoiceCard>
      </QuestionShell>

      <PrefQuestion
        kicker="Q3"
        copy={Q3}
        name="q3"
        options={SCOPE_OPTIONS}
        answer={value.contentScope}
        onAnswer={(answer) => onChange({ ...value, contentScope: answer })}
      />
      <PrefQuestion
        kicker="Q4"
        copy={Q4}
        name="q4"
        options={PACING_OPTIONS}
        answer={value.sectionAdvance}
        onAnswer={(answer) => onChange({ ...value, sectionAdvance: answer })}
      />
      <PrefQuestion
        kicker="Q5"
        copy={Q5}
        name="q5"
        options={ORDER_OPTIONS}
        answer={value.explanationOrder}
        onAnswer={(answer) => onChange({ ...value, explanationOrder: answer })}
        noPreferenceLabel={NO_PREFERENCE_ORDER}
      />
      <PrefQuestion
        kicker="Q6"
        copy={Q6}
        name="q6"
        options={CADENCE_OPTIONS}
        answer={value.quizCadence}
        onAnswer={(answer) => onChange({ ...value, quizCadence: answer })}
      />
      <PrefQuestion
        kicker="Q7"
        copy={Q7}
        name="q7"
        options={TIMING_OPTIONS}
        answer={value.feedbackTiming}
        onAnswer={(answer) => onChange({ ...value, feedbackTiming: answer })}
      />
      <PrefQuestion
        kicker="Q8"
        copy={Q8}
        name="q8"
        options={DEPTH_OPTIONS}
        answer={value.feedbackDepth}
        onAnswer={(answer) => onChange({ ...value, feedbackDepth: answer })}
      />
    </div>
  );
}

type PrefQuestionProps<T extends string> = {
  kicker: string;
  copy: { title: string; prompt: string };
  name: string;
  options: { value: T; label: string; hint?: string }[];
  answer: ProfileAnswer<T> | Unset;
  onAnswer: (answer: ProfileAnswer<T>) => void;
  noPreferenceLabel?: string;
};

/**
 * Single-select preference with no preference and prefer-not-to-answer.
 */
function PrefQuestion<T extends string>({
  kicker,
  copy,
  name,
  options,
  answer,
  onAnswer,
  noPreferenceLabel = NO_PREFERENCE,
}: PrefQuestionProps<T>) {
  return (
    <QuestionShell kicker={kicker} title={copy.title} prompt={copy.prompt}>
      {options.map((option) => (
        <ChoiceCard
          key={option.value}
          name={name}
          type="radio"
          checked={answer.status === "selected" && answer.value === option.value}
          onChange={() => onAnswer(setPref("selected", option.value))}
          hint={option.hint}
        >
          {option.label}
        </ChoiceCard>
      ))}
      <ChoiceCard
        name={name}
        type="radio"
        checked={answer.status === "no_preference"}
        onChange={() => onAnswer(setPref("no_preference"))}
      >
        {noPreferenceLabel}
      </ChoiceCard>
      <ChoiceCard
        name={name}
        type="radio"
        checked={answer.status === "skipped"}
        onChange={() => onAnswer(setPref("skipped"))}
      >
        {PREFER_NOT}
      </ChoiceCard>
    </QuestionShell>
  );
}
