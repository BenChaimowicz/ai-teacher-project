import type { ProfileAnswer, TeachingProfileAnswers } from "@senoy/db/teaching-profile";
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

type ProfileViewProps = {
  answers: TeachingProfileAnswers;
};

/**
 * Finds the label for a selected radio value.
 * @typeParam T - Option value
 */
function labelOf<T extends string>(value: T, options: { value: T; label: string; hint?: string }[]) {
  const match = options.find((option) => option.value === value);
  if (!match) return value;
  return match.hint ? `${match.label} — ${match.hint}` : match.label;
}

type RowProps = { title: string; prompt: string; children: string; note?: string };

/**
 * One read-only answer row.
 */
function Row({ title, prompt, children, note }: RowProps) {
  return (
    <article className="rounded-xl border border-border bg-card/40 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{prompt}</p>
      <p className="mt-3 text-sm font-medium">{children}</p>
      {note ? <p className="mt-2 text-sm text-muted-foreground">{note}</p> : null}
    </article>
  );
}

/**
 * Viewing a saved Teaching Profile. Not an editor.
 */
export function ProfileView({ answers }: ProfileViewProps) {
  const language =
    answers.instructionLanguage.status === "declared"
      ? labelOf(answers.instructionLanguage.value, LANGUAGE_OPTIONS)
      : PREFER_NOT;

  let supports: string;
  if (answers.requiredReadingSupports.status === "declared") {
    supports = answers.requiredReadingSupports.value
      .map((flag) => SUPPORT_OPTIONS.find((option) => option.value === flag)?.label ?? flag)
      .join("; ");
  } else if (answers.requiredReadingSupports.status === "none_declared") {
    supports = NONE_OF_THESE;
  } else {
    supports = PREFER_NOT;
  }

  /**
   * Turns a preference answer into Learner-facing text.
   */
  function prefText<T extends string>(
    answer: ProfileAnswer<T>,
    options: { value: T; label: string; hint?: string }[],
    noPreference = NO_PREFERENCE,
  ) {
    if (answer.status === "selected") return labelOf(answer.value, options);
    if (answer.status === "no_preference") return noPreference;
    return PREFER_NOT;
  }

  return (
    <div className="grid gap-3">
      <Row
        title={Q1.title}
        prompt={Q1.prompt}
        note={
          answers.instructionLanguage.status === "declared" && answers.instructionLanguage.value === "not_listed"
            ? LANGUAGE_NOT_LISTED_DISCLAIMER
            : undefined
        }
      >
        {language}
      </Row>
      <Row title={Q2.title} prompt={Q2.prompt}>
        {supports}
      </Row>
      <Row title={Q3.title} prompt={Q3.prompt}>
        {prefText(answers.contentScope, SCOPE_OPTIONS)}
      </Row>
      <Row title={Q4.title} prompt={Q4.prompt}>
        {prefText(answers.sectionAdvance, PACING_OPTIONS)}
      </Row>
      <Row title={Q5.title} prompt={Q5.prompt}>
        {prefText(answers.explanationOrder, ORDER_OPTIONS, NO_PREFERENCE_ORDER)}
      </Row>
      <Row title={Q6.title} prompt={Q6.prompt}>
        {prefText(answers.quizCadence, CADENCE_OPTIONS)}
      </Row>
      <Row title={Q7.title} prompt={Q7.prompt}>
        {prefText(answers.feedbackTiming, TIMING_OPTIONS)}
      </Row>
      <Row title={Q8.title} prompt={Q8.prompt}>
        {prefText(answers.feedbackDepth, DEPTH_OPTIONS)}
      </Row>
    </div>
  );
}
