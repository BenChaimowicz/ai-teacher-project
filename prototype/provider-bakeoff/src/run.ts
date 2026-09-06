import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODELS,
  otherModel,
  structuredGenerate,
} from "./adapters.ts";
import { cases } from "./fixtures.ts";
import {
  GENERATOR_SYSTEM,
  quizJudgePrompt,
  quizUserPrompt,
  readingJudgePrompt,
  readingUserPrompt,
} from "./prompts.ts";
import { renderHtml } from "./report.ts";
import { judgeSchema, quizSchema, readingSchema } from "./schemas.ts";
import type {
  ArtifactRecord,
  AttemptRecord,
  BakeoffRun,
  CaseRun,
  GeneratedQuiz,
  JudgeResult,
  LessonCase,
  ModelName,
  ProviderRun,
  ReadingLesson,
} from "./types.ts";
import { parseJson, validateQuiz, validateReading } from "./validate.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_ATTEMPTS = 3;

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(join(root, ".env"));
loadEnvFile(join(root, "../../.env"));

function asReading(value: unknown): ReadingLesson {
  return value as ReadingLesson;
}

function asQuiz(value: unknown): GeneratedQuiz {
  const q = value as GeneratedQuiz;
  if (Array.isArray(q.items)) {
    q.items = q.items.map((item) => ({
      ...item,
      options: item.options as GeneratedQuiz["items"][number]["options"],
      correctIndex: item.correctIndex as 0 | 1 | 2 | 3,
    }));
  }
  return q;
}

async function generateWithRepair(
  provider: ModelName,
  kind: "reading" | "quiz",
  user: string,
  validate: (parsed: unknown) => ReturnType<typeof validateReading>,
): Promise<{ attempts: AttemptRecord[]; accepted: unknown | null }> {
  const attempts: AttemptRecord[] = [];
  let accepted: unknown | null = null;
  const schema = kind === "reading" ? readingSchema : quizSchema;
  const name = kind === "reading" ? "reading_lesson" : "quiz_lesson";
  const maxTokens = kind === "reading" ? 4096 : 3072;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let rawText = "";
    let parseError: string | null = null;
    let parsed: unknown = null;
    const call = await structuredGenerate(provider, {
      name,
      schema,
      system: GENERATOR_SYSTEM,
      user:
        attempt === 1
          ? user
          : `${user}\n\nPrevious attempt failed Code checks:\n${attempts
              .at(-1)
              ?.code.issues.map((i) => `- ${i.check}: ${i.detail}`)
              .join("\n")}\nFix those issues. Same retrieval set only.`,
      maxTokens,
    });
    rawText = call.text;
    try {
      parsed = parseJson(rawText);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
    const code =
      parsed === null
        ? {
            pass: false,
            issues: [{ check: "schema", detail: parseError ?? "unparseable JSON" }],
          }
        : validate(parsed);
    attempts.push({
      attempt,
      latencyMs: call.latencyMs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costUsd: call.costUsd,
      rawText,
      parseError,
      code,
    });
    if (code.pass && parsed !== null) {
      accepted = parsed;
      break;
    }
  }
  return { attempts, accepted };
}

async function judgeArtifact(
  author: ModelName,
  kind: "reading" | "quiz",
  user: string,
): Promise<{ judge: JudgeResult | null; latencyMs: number; costUsd: number; model: string }> {
  const judgeProvider = otherModel(author);
  const call = await structuredGenerate(judgeProvider, {
    name: "judge_result",
    schema: judgeSchema,
    system:
      "You are an independent Publish-gate Judge. You did not write the artifact. Return JSON only.",
    user,
    maxTokens: 2048,
  });
  try {
    const parsed = parseJson(call.text) as JudgeResult;
    return {
      judge: parsed,
      latencyMs: call.latencyMs,
      costUsd: call.costUsd,
      model: MODELS[judgeProvider],
    };
  } catch {
    return {
      judge: {
        pass: false,
        failures: [{ check: "judge-schema", detail: "Judge JSON did not parse" }],
        clarity: 1,
        usefulness: 1,
        levelFit: 1,
        notes: call.text.slice(0, 500),
      },
      latencyMs: call.latencyMs,
      costUsd: call.costUsd,
      model: MODELS[judgeProvider],
    };
  }
}

async function runCase(provider: ModelName, lessonCase: LessonCase): Promise<CaseRun> {
  const readingGen = await generateWithRepair(
    provider,
    "reading",
    readingUserPrompt(lessonCase),
    (parsed) => validateReading(asReading(parsed), lessonCase.sources),
  );
  const readingAccepted = readingGen.accepted
    ? asReading(readingGen.accepted)
    : null;
  const reading: ArtifactRecord = {
    kind: "reading",
    attempts: readingGen.attempts,
    accepted: readingAccepted,
    judge: null,
    judgeLatencyMs: 0,
    judgeCostUsd: 0,
    judgeModel: "",
  };
  if (readingAccepted) {
    const judged = await judgeArtifact(
      provider,
      "reading",
      readingJudgePrompt(lessonCase, readingAccepted),
    );
    reading.judge = judged.judge;
    reading.judgeLatencyMs = judged.latencyMs;
    reading.judgeCostUsd = judged.costUsd;
    reading.judgeModel = judged.model;
  }

  const quiz: ArtifactRecord = {
    kind: "quiz",
    attempts: [],
    accepted: null,
    judge: null,
    judgeLatencyMs: 0,
    judgeCostUsd: 0,
    judgeModel: "",
  };
  if (readingAccepted) {
    const quizGen = await generateWithRepair(
      provider,
      "quiz",
      quizUserPrompt(lessonCase, readingAccepted),
      (parsed) => validateQuiz(asQuiz(parsed)),
    );
    quiz.attempts = quizGen.attempts;
    const quizAccepted = quizGen.accepted ? asQuiz(quizGen.accepted) : null;
    quiz.accepted = quizAccepted;
    if (quizAccepted) {
      const judged = await judgeArtifact(
        provider,
        "quiz",
        quizJudgePrompt(lessonCase, readingAccepted, quizAccepted),
      );
      quiz.judge = judged.judge;
      quiz.judgeLatencyMs = judged.latencyMs;
      quiz.judgeCostUsd = judged.costUsd;
      quiz.judgeModel = judged.model;
    }
  } else {
    quiz.attempts.push({
      attempt: 1,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      rawText: "",
      parseError: "skipped: reading never passed Code checks",
      code: {
        pass: false,
        issues: [{ check: "dependency", detail: "reading never passed Code checks" }],
      },
    });
  }

  return { caseId: lessonCase.id, reading, quiz };
}

async function runProvider(provider: ModelName): Promise<ProviderRun> {
  const results: CaseRun[] = [];
  for (const lessonCase of cases) {
    process.stderr.write(`[${provider}] ${lessonCase.id}\n`);
    results.push(await runCase(provider, lessonCase));
  }
  return { provider, model: MODELS[provider], cases: results };
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    process.stderr.write(
      "Need OPENROUTER_API_KEY in the environment or prototype/provider-bakeoff/.env\n",
    );
    process.exit(1);
  }
  const startedAt = new Date().toISOString();
  const [deepseek, terra] = await Promise.all([
    runProvider("deepseek"),
    runProvider("terra"),
  ]);
  const run: BakeoffRun = {
    startedAt,
    finishedAt: new Date().toISOString(),
    deepseek,
    terra,
  };
  const outDir = join(root, "runs");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "latest.json"), JSON.stringify(run, null, 2));
  writeFileSync(join(outDir, "latest.html"), renderHtml(run));
  process.stderr.write(`Wrote ${join(outDir, "latest.html")}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : err}\n`);
  process.exit(1);
});
