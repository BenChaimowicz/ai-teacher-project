import type {
  ContentScope,
  ExplanationOrderChoice,
  FeedbackDepth,
  FeedbackTiming,
  QuizCadence,
  ReadingSupport,
  SectionAdvance,
} from "@senoy/db/teaching-profile";

/** Intro shown above the questionnaire. */
export const PROFILE_INTRO =
  "These choices set up how your Lessons are presented. They are not a test of intelligence, ability, or disability. You can skip any question and change these choices later.";

/** Spec prohibition made visible. */
export const PROFILE_SKIP_NOTE =
  "Skipping or preferring not to answer does not reduce your access or Progress. This is not a test, a diagnosis, or a learning-style label.";

/** Shown when Q1 is “not listed”. */
export const LANGUAGE_NOT_LISTED_DISCLAIMER =
  "Lessons are English only at this moment. There is no translation into another language. Instructional language will stay English.";

/** Confirm copy for Save after the Teaching Profile already exists. */
export const SAVE_EXISTING_DISCLAIMER =
  "These choices apply to Courses you request after this. Courses you already have keep their current Lessons and layout.";

/** Confirm copy for Reset. */
export const RESET_DISCLAIMER =
  "This deletes your saved answers. Courses you already have still do not change. New Course Request stays blocked until you save again.";

/** Why New Course Request waits. */
export const COURSE_REQUEST_BLOCKED =
  "Save a Teaching Profile before you request a Course. Home stays available; this is the one step that has to come first.";

type RadioOption<T extends string> = { value: T; label: string; hint?: string };

/** One questionnaire item’s Learner-facing copy. */
export type QuestionCopy = {
  id: string;
  title: string;
  prompt: string;
};

export const Q1: QuestionCopy = {
  id: "q1",
  title: "Instructional language",
  prompt: "Which language should reading Lessons, Quiz questions, and Quiz feedback use?",
};

export const Q2: QuestionCopy = {
  id: "q2",
  title: "Reading requirements",
  prompt: "Do any of these need to be true for reading Lessons to be usable for you? Select all that apply.",
};

export const Q3: QuestionCopy = {
  id: "q3",
  title: "Reading-Lesson scope",
  prompt: "How much content should one reading Lesson usually cover?",
};

export const Q4: QuestionCopy = {
  id: "q4",
  title: "Section pacing",
  prompt: "How should sections inside a reading Lesson advance?",
};

export const Q5: QuestionCopy = {
  id: "q5",
  title: "Example order",
  prompt: "When a new idea has a useful example, which order would you like?",
};

export const Q6: QuestionCopy = {
  id: "q6",
  title: "Quiz cadence",
  prompt: "How much reading would you like between short Quiz Lessons?",
};

export const Q7: QuestionCopy = {
  id: "q7",
  title: "Feedback timing",
  prompt: "When should a Quiz show the answer and explanation?",
};

export const Q8: QuestionCopy = {
  id: "q8",
  title: "Feedback detail",
  prompt: "How much feedback should each Quiz answer include?",
};

export const LANGUAGE_OPTIONS: RadioOption<"en" | "not_listed">[] = [
  { value: "en", label: "English" },
  { value: "not_listed", label: "I need a language that is not listed" },
];

export const SUPPORT_OPTIONS: { value: ReadingSupport; label: string }[] = [
  { value: "plain_language", label: "Use plain, direct wording" },
  { value: "short_headed_paragraphs", label: "Use short paragraphs with clear headings" },
  { value: "inline_definitions", label: "Define unfamiliar terms where they first appear" },
];

export const SCOPE_OPTIONS: RadioOption<ContentScope>[] = [
  { value: "compact", label: "Compact", hint: "one key idea" },
  { value: "standard", label: "Standard", hint: "a few connected ideas" },
  { value: "extended", label: "Extended", hint: "a fuller treatment with fewer Lesson breaks" },
];

export const PACING_OPTIONS: RadioOption<SectionAdvance>[] = [
  { value: "manual", label: "Pause after each section until I choose Continue" },
  { value: "continuous", label: "Keep the Lesson continuous so I can scroll at my own pace" },
];

export const ORDER_OPTIONS: RadioOption<ExplanationOrderChoice>[] = [
  { value: "example_first", label: "Show a concrete or worked example, then explain it" },
  { value: "principle_first", label: "Explain the idea, then show a concrete or worked example" },
];

export const CADENCE_OPTIONS: RadioOption<QuizCadence>[] = [
  { value: "every_reading", label: "A Quiz after every reading Lesson" },
  { value: "every_2_to_3_readings", label: "A Quiz after every 2–3 reading Lessons" },
  { value: "module_end", label: "A Quiz at the end of each Module" },
];

export const TIMING_OPTIONS: RadioOption<FeedbackTiming>[] = [
  { value: "per_item", label: "After each question" },
  { value: "end_of_quiz", label: "After I submit the whole Quiz" },
];

export const DEPTH_OPTIONS: RadioOption<FeedbackDepth>[] = [
  { value: "brief", label: "Brief", hint: "the correct answer and a one-sentence reason" },
  { value: "standard", label: "Standard", hint: "a concise explanation, including why another choice is wrong when useful" },
  { value: "detailed", label: "Detailed", hint: "a fuller explanation with an example or retry hint" },
];

export const PREFER_NOT = "Prefer not to answer";
export const NO_PREFERENCE = "No preference — use the default";
export const NO_PREFERENCE_ORDER = "No preference — use the best order for the topic";
export const NONE_OF_THESE = "None of these";
