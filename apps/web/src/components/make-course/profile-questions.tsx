import {
  AlignJustify,
  BookOpen,
  CheckCheck,
  Clock,
  Eye,
  HelpCircle,
  Layers,
  Lightbulb,
  ListChecks,
  ListOrdered,
  MessageSquare,
  PauseCircle,
  Shuffle,
  SkipForward,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DeclaredNeed, ProfileAnswer, ReadingSupport, TeachingProfileAnswers } from "@senoy/db/teaching-profile";

/**
 * The seven questions of "How you like to learn" (spec §4.1 Q2–Q8, SEN-56). Q1, the instructional language, is not
 * asked while English is the only language: it stays as saved, or skipped, and resolves to English.
 */
export type ProfileField = Exclude<keyof TeachingProfileAnswers, "instructionLanguage">;

/** Answers given so far; a missing field has not been asked yet. */
export type ProfileDraft = Partial<Pick<TeachingProfileAnswers, ProfileField>>;

/** One choice in a question. */
export type ProfileChoice = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** Short words for the summary panel. */
  chip: string;
  /** Words for the "in short" line; omitted when the choice is the usual. */
  line?: string;
};

/** One question. */
export type ProfileQuestion = {
  field: ProfileField;
  /** Summary-panel label. */
  short: string;
  /** What the line means, on the returning view. */
  about: string;
  icon: ReactNode;
  ask: string;
  choices: ProfileChoice[];
  /** Multi-select (Q2 only). */
  multi?: boolean;
  /** The "No preference" tile, worded for this question. */
  noPreference?: { label: string; description: string };
  /** What the default does, in summary words. */
  defaultChip: string;
};

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    field: "requiredReadingSupports", short: "reading", about: "how lessons are written", icon: <BookOpen />, multi: true,
    ask: "Anything that makes reading easier for you? Pick as many as you like.",
    choices: [
      { value: "plain_language", label: "Plain, direct wording", chip: "plain wording" },
      { value: "short_headed_paragraphs", label: "Short paragraphs with clear headings", chip: "short paragraphs" },
      { value: "inline_definitions", label: "Explain new terms where they first appear", chip: "terms explained" },
    ],
    defaultChip: "nothing extra",
  },
  {
    field: "contentScope", short: "lesson size", about: "how much one lesson covers", icon: <Layers />,
    ask: "How much should one lesson cover?",
    choices: [
      { value: "compact", label: "One key idea", description: "Short and focused", chip: "short", line: "short lessons" },
      { value: "standard", label: "A few connected ideas", description: "The usual", chip: "standard", line: "standard lessons" },
      { value: "extended", label: "The fuller story", description: "Longer, with fewer breaks", chip: "long", line: "longer lessons" },
    ],
    defaultChip: "standard",
  },
  {
    field: "sectionAdvance", short: "pacing", about: "how a lesson moves along", icon: <ListOrdered />,
    ask: "How should a lesson move along?",
    choices: [
      { value: "manual", label: "Pause after each section", description: "I tap Continue when I'm ready", icon: <PauseCircle />, chip: "section by section", line: "a pause after each section" },
      { value: "continuous", label: "One continuous page", description: "I scroll at my own pace", icon: <AlignJustify />, chip: "continuous" },
    ],
    defaultChip: "continuous",
  },
  {
    field: "explanationOrder", short: "examples", about: "what comes first", icon: <Eye />,
    ask: "When there's a good example, what comes first?",
    choices: [
      { value: "example_first", label: "The example", description: "Then the idea behind it", icon: <Eye />, chip: "examples first", line: "examples first" },
      { value: "principle_first", label: "The idea", description: "Then an example of it", icon: <Lightbulb />, chip: "idea first", line: "the idea before the example" },
    ],
    noPreference: { label: "Whatever suits the topic", description: "I'll pick per lesson" },
    defaultChip: "suits the topic",
  },
  {
    field: "quizCadence", short: "quizzes", about: "how often you get a quick check", icon: <Target />,
    ask: "How often would you like a quick check?",
    choices: [
      { value: "every_reading", label: "After every lesson", description: "Little and often", chip: "after every lesson", line: "a quiz after every lesson" },
      { value: "every_2_to_3_readings", label: "Every 2–3 lessons", description: "A bit more reading first", chip: "every 2–3 lessons" },
      { value: "module_end", label: "At the end of each part", description: "Read a whole part, then check", chip: "end of each part", line: "a quiz at the end of each part" },
    ],
    defaultChip: "every 2–3 lessons",
  },
  {
    field: "feedbackTiming", short: "answers", about: "when quiz answers show", icon: <Clock />,
    ask: "In a quiz, when should I show the answer?",
    choices: [
      { value: "per_item", label: "Right after each question", description: "You see how you did as you go", icon: <CheckCheck />, chip: "after each question", line: "feedback after each question" },
      { value: "end_of_quiz", label: "After the whole quiz", description: "All the answers together at the end", icon: <ListChecks />, chip: "at the end", line: "feedback at the end of a quiz" },
    ],
    defaultChip: "after each question",
  },
  {
    field: "feedbackDepth", short: "explanations", about: "how much each answer explains", icon: <HelpCircle />,
    ask: "And how much explanation with each answer?",
    choices: [
      { value: "brief", label: "Brief", description: "The answer and one sentence why", icon: <MessageSquare />, chip: "brief", line: "brief explanations" },
      { value: "standard", label: "Standard", description: "A short explanation, and why other choices miss", icon: <MessageSquare />, chip: "standard" },
      { value: "detailed", label: "Detailed", description: "A fuller explanation with an example", icon: <MessageSquare />, chip: "detailed", line: "detailed explanations" },
    ],
    defaultChip: "standard",
  },
];

/** Icons for the shared "No preference" and "Skip" tiles. */
export const NO_PREFERENCE_ICON = <Shuffle />;
export const SKIP_ICON = <SkipForward />;

/** One answer to one question, in the stored shape for its field. */
export type FieldAnswer = TeachingProfileAnswers[ProfileField];

/** How an answer reads in the summary: its words, and whether it is the default (no preference, skipped, nothing). */
export type AnswerSummary = { chip: string; tag: "default" | "skipped" | null };

/**
 * Summary words for one answer.
 * @param question - The question
 * @param answer - Its answer, or undefined when not asked yet
 */
export function summarize(question: ProfileQuestion, answer: FieldAnswer | undefined): AnswerSummary | null {
  if (!answer) return null;
  if (answer.status === "skipped") return { chip: question.defaultChip, tag: "skipped" };
  if (answer.status === "no_preference") return { chip: question.defaultChip, tag: "default" };
  if (answer.status === "none_declared") return { chip: "nothing extra", tag: null };
  if (answer.status === "declared") {
    const flags = answer.value as ReadingSupport[];
    return { chip: question.choices.filter((choice) => flags.includes(choice.value as ReadingSupport)).map((choice) => choice.chip).join(", "), tag: null };
  }
  const picked = question.choices.find((choice) => choice.value === answer.value);
  return { chip: picked?.chip ?? question.defaultChip, tag: null };
}

/**
 * The Learner's pick, echoed in the thread.
 * @param question - The question
 * @param answer - Its answer
 */
export function echoText(question: ProfileQuestion, answer: FieldAnswer): string {
  if (answer.status === "skipped") return "Skip this one";
  if (answer.status === "no_preference") return question.noPreference?.label ?? "No preference";
  if (answer.status === "none_declared") return "None of these";
  if (answer.status === "declared") {
    const flags = answer.value as ReadingSupport[];
    return question.choices.filter((choice) => flags.includes(choice.value as ReadingSupport)).map((choice) => choice.label).join(" · ");
  }
  return question.choices.find((choice) => choice.value === answer.value)?.label ?? "";
}

/**
 * "In short": a one-line description of how lessons will be taught.
 * @param draft - Answers so far
 */
export function oneLiner(draft: ProfileDraft): string {
  const line = (field: ProfileField, fallback: string | null) => {
    const question = PROFILE_QUESTIONS.find((candidate) => candidate.field === field)!;
    const answer = draft[field];
    if (answer?.status === "selected") return question.choices.find((choice) => choice.value === answer.value)?.line ?? fallback;
    return fallback;
  };
  const parts = [
    line("contentScope", "standard lessons"),
    line("explanationOrder", "examples when they help"),
    line("feedbackTiming", "feedback after each question"),
    line("sectionAdvance", null),
    line("quizCadence", null),
    line("feedbackDepth", null),
  ].filter((part): part is string => Boolean(part));
  const reading = draft.requiredReadingSupports;
  if (reading?.status === "declared") parts.push(summarize(PROFILE_QUESTIONS[0]!, reading)!.chip);
  return parts.join(" · ");
}

/**
 * The full answers to save: every asked field from the draft, the rest skipped, and Q1 kept as saved (skipped when
 * new, which resolves to English).
 * @param draft - Answers given
 * @param saved - The saved answers, if any
 */
export function toAnswers(draft: ProfileDraft, saved: TeachingProfileAnswers | null): TeachingProfileAnswers {
  const skipped = { status: "skipped" } as const;
  return {
    instructionLanguage: saved?.instructionLanguage ?? skipped,
    requiredReadingSupports: draft.requiredReadingSupports ?? skipped,
    contentScope: draft.contentScope ?? skipped,
    sectionAdvance: draft.sectionAdvance ?? skipped,
    explanationOrder: draft.explanationOrder ?? skipped,
    quizCadence: draft.quizCadence ?? skipped,
    feedbackTiming: draft.feedbackTiming ?? skipped,
    feedbackDepth: draft.feedbackDepth ?? skipped,
  };
}

/** The stored answers as a draft (every field answered). */
export function fromAnswers(answers: TeachingProfileAnswers): ProfileDraft {
  const { instructionLanguage: _language, ...rest } = answers;
  return rest;
}

/** A preference answer for a single-select question. */
export function preference(value: string | "no_preference" | "skipped"): ProfileAnswer<string> {
  if (value === "no_preference") return { status: "no_preference" };
  if (value === "skipped") return { status: "skipped" };
  return { status: "selected", value };
}

/** A declared-need answer for Q2. */
export function readingNeed(flags: ReadingSupport[] | "none" | "skipped"): DeclaredNeed<ReadingSupport[]> {
  if (flags === "skipped") return { status: "skipped" };
  if (flags === "none" || flags.length === 0) return { status: "none_declared" };
  return { status: "declared", value: flags };
}
