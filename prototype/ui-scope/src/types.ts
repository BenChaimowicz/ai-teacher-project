export const SCENES = [
  { id: "home", label: "Home / library" },
  { id: "request", label: "Course Request" },
  { id: "request-clarify", label: "Validity: clarify" },
  { id: "request-reject", label: "Validity: reject" },
  { id: "teaching-profile", label: "Teaching Profile" },
  { id: "diagnostic", label: "Starting Level diagnostic" },
  { id: "remaining-gap", label: "Remaining-gap confirm" },
  { id: "ceiling", label: "Ceiling fork" },
  { id: "assessment-failed", label: "Assessment failed" },
  { id: "waiting-blueprint", label: "Waiting: Blueprint" },
  { id: "blueprint-review", label: "Blueprint review" },
  { id: "waiting-course", label: "Waiting: Course gen" },
  { id: "generation-fail", label: "Generation failed" },
  { id: "course-home", label: "Published Course" },
  { id: "reading", label: "Reading Lesson" },
  { id: "quiz-taking", label: "Quiz (draft)" },
  { id: "quiz-feedback", label: "Quiz (feedback)" },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export const VARIANTS = [
  { key: "A", name: "Documented pages" },
  { key: "B", name: "Workspace + study" },
  { key: "C", name: "Guide thread" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

export type SequenceMode = "linear" | "free-jump";

export type ProtoState = {
  scene: SceneId;
  requestDraft: string;
  profileQ: Record<string, string>;
  diagnosticAnswers: Array<number | "idk" | null>;
  quizAnswers: Array<number | null>;
  quizBest: number;
  showAnswerKey: boolean;
  readingSection: number;
  readingMarkedComplete: boolean;
  sequenceMode: SequenceMode;
  markedIrrelevant: string[];
  canceled: boolean;
  lessonsOpen: boolean;
};

export type VariantProps = {
  scene: SceneId;
  state: ProtoState;
  setState: (patch: Partial<ProtoState>) => void;
  go: (scene: SceneId) => void;
};

export const defaultState = (): Omit<ProtoState, "scene"> => ({
  requestDraft: "Drum kit fundamentals — play Iris by the Goo Goo Dolls",
  profileQ: {},
  diagnosticAnswers: [null, null, null, null, null, null, null, null],
  quizAnswers: [null, null, null, null, null, null],
  quizBest: 50,
  showAnswerKey: false,
  readingSection: 0,
  readingMarkedComplete: false,
  sequenceMode: "linear",
  markedIrrelevant: [],
  canceled: false,
  lessonsOpen: false,
});
