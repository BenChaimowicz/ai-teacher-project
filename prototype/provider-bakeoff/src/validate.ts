import type {
  CodeIssue,
  CodeResult,
  GeneratedQuiz,
  ReadingLesson,
  Source,
} from "./types.ts";

const MARKER = /\[(S\d+)\]/g;

export function validateReading(
  lesson: ReadingLesson,
  sources: Source[],
): CodeResult {
  const issues: CodeIssue[] = [];
  const known = new Map(sources.map((s) => [s.id, s]));

  if (!lesson.title?.trim()) issues.push({ check: "envelope", detail: "empty title" });
  if (!lesson.lessonGoal?.trim())
    issues.push({ check: "envelope", detail: "empty lessonGoal" });
  if (!Array.isArray(lesson.topicTags) || lesson.topicTags.length === 0) {
    issues.push({ check: "envelope", detail: "topicTags required" });
  }
  if (!Array.isArray(lesson.sections) || lesson.sections.length === 0) {
    issues.push({ check: "reading-body", detail: "no reading sections" });
  }

  const citedInProse = new Set<string>();
  for (const section of lesson.sections ?? []) {
    if (!section.heading?.trim() || !section.prose?.trim()) {
      issues.push({
        check: "reading-body",
        detail: "section missing heading or prose",
      });
      continue;
    }
    for (const match of section.prose.matchAll(MARKER)) {
      const id = match[1];
      citedInProse.add(id);
      if (!known.has(id)) {
        issues.push({
          check: "citation-set",
          detail: `prose cites unknown ${id}`,
        });
      }
    }
  }

  if (!Array.isArray(lesson.citations) || lesson.citations.length === 0) {
    issues.push({ check: "citation-set", detail: "citations list is empty" });
  }

  const listed = new Set<string>();
  for (const citation of lesson.citations ?? []) {
    listed.add(citation.sourceId);
    const source = known.get(citation.sourceId);
    if (!source) {
      issues.push({
        check: "citation-set",
        detail: `citations list has unknown ${citation.sourceId}`,
      });
      continue;
    }
    if (citation.usedAs !== "quote" && citation.usedAs !== "paraphrase") {
      issues.push({
        check: "citation-set",
        detail: `${citation.sourceId} usedAs must be quote or paraphrase`,
      });
    }
    if (citation.usedAs === "quote") {
      const quoted = citation.quotedText ?? "";
      if (!quoted.trim()) {
        issues.push({
          check: "citation-set",
          detail: `${citation.sourceId} quote missing quotedText`,
        });
      } else if (!source.content.includes(quoted.trim())) {
        issues.push({
          check: "citation-set",
          detail: `${citation.sourceId} quotedText is not in the retrieval excerpt`,
        });
      }
    }
  }

  for (const id of citedInProse) {
    if (!listed.has(id)) {
      issues.push({
        check: "citation-set",
        detail: `prose cites ${id} but citations list omits it`,
      });
    }
  }

  return { pass: issues.length === 0, issues };
}

export function validateQuiz(quiz: GeneratedQuiz): CodeResult {
  const issues: CodeIssue[] = [];
  const items = quiz.items;
  if (!Array.isArray(items)) {
    return { pass: false, issues: [{ check: "quiz-shape", detail: "items missing" }] };
  }
  if (items.length < 5 || items.length > 10) {
    issues.push({
      check: "quiz-shape",
      detail: `n must be 5–10, got ${items.length}`,
    });
  }
  items.forEach((item, i) => {
    if (!item.prompt?.trim()) {
      issues.push({ check: "quiz-shape", detail: `item ${i} empty prompt` });
    }
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      issues.push({
        check: "quiz-shape",
        detail: `item ${i} must have exactly four options`,
      });
    } else if (item.options.some((o) => !o?.trim())) {
      issues.push({ check: "quiz-shape", detail: `item ${i} has an empty option` });
    } else if (new Set(item.options).size < 4) {
      issues.push({ check: "quiz-shape", detail: `item ${i} has duplicate options` });
    }
    if (![0, 1, 2, 3].includes(item.correctIndex)) {
      issues.push({
        check: "quiz-shape",
        detail: `item ${i} correctIndex must be 0–3`,
      });
    }
    if (!item.explanation?.trim()) {
      issues.push({ check: "quiz-shape", detail: `item ${i} empty explanation` });
    }
  });
  return { pass: issues.length === 0, issues };
}

export function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}
