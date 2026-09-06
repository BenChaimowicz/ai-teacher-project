export type Source = {
  id: string;
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string;
  content: string;
};

export type LessonCase = {
  id: string;
  subject: string;
  learningGoal: string;
  remainingGap: string;
  lessonTitle: string;
  lessonGoal: string;
  objectives: string[];
  topicTags: string[];
  sources: Source[];
};

export type ReadingLesson = {
  title: string;
  lessonGoal: string;
  topicTags: string[];
  sections: { heading: string; prose: string }[];
  citations: {
    sourceId: string;
    usedAs: "quote" | "paraphrase";
    quotedText: string | null;
  }[];
};

export type QuizItem = {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
};

export type GeneratedQuiz = {
  items: QuizItem[];
};

export type CodeIssue = {
  check: string;
  detail: string;
};

export type CodeResult = {
  pass: boolean;
  issues: CodeIssue[];
};

export type JudgeFailure = {
  check: string;
  detail: string;
};

export type JudgeResult = {
  pass: boolean;
  failures: JudgeFailure[];
  clarity: number;
  usefulness: number;
  levelFit: number;
  notes: string;
};

export type AttemptRecord = {
  attempt: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  rawText: string;
  parseError: string | null;
  code: CodeResult;
};

export type ArtifactRecord = {
  kind: "reading" | "quiz";
  attempts: AttemptRecord[];
  accepted: unknown | null;
  judge: JudgeResult | null;
  judgeLatencyMs: number;
  judgeCostUsd: number;
  judgeModel: string;
};

export type CaseRun = {
  caseId: string;
  reading: ArtifactRecord;
  quiz: ArtifactRecord;
};

export type ModelName = "deepseek" | "terra";

export type ProviderRun = {
  provider: ModelName;
  model: string;
  cases: CaseRun[];
};

export type BakeoffRun = {
  startedAt: string;
  finishedAt: string;
  deepseek: ProviderRun;
  terra: ProviderRun;
};
