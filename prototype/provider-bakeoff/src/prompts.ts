import type { LessonCase, ReadingLesson } from "./types.ts";

export const GENERATOR_SYSTEM = `You generate one Lesson for an English-only AI learning course.

Rules:
- Use ONLY the provided retrieval-set excerpts. Do not use built-in web search or your own memory as evidence.
- Every factual claim in reading prose must be supported by a cited excerpt. Cite with [S1], [S2], … matching a provided source ID.
- Paraphrase by default. A quote is allowed only when usedAs is "quote" and quotedText is copied verbatim from that source's content.
- Drop any citation whose source ID was not provided.
- Do not invent a substitute of a named copyrighted work (no song charts, official lyrics, or official audio). Named works may be discussed as transferable skills only if the sources support that.
- Do not teach Marvel, MCU, or other franchise versions of a mythic figure. Corpus sources only.
- Instructional language is English.
- Return JSON that matches the schema. No markdown fences.`;

export function readingUserPrompt(c: LessonCase): string {
  const sources = c.sources
    .map(
      (s) =>
        `[${s.id}]\nTitle: ${s.title}\nURL: ${s.url}\nPublisher: ${s.publisher}\nRetrieved: ${s.retrievedAt}\n---\n${s.content}`,
    )
    .join("\n\n");
  return `Generate one reading Lesson.

Subject: ${c.subject}
Course Learning Goal: ${c.learningGoal}
Starting Level remaining gap: ${c.remainingGap}
Lesson title: ${c.lessonTitle}
Lesson goal (one sentence, Learner-facing): ${c.lessonGoal}
Objectives (teach all of these):
${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}
Topic tags: ${c.topicTags.join(", ")}

Retrieval set:
${sources}

Write 2–4 headed reading sections. Numbered citations in the prose as [S1] etc. List every used source in citations.`;
}

export function quizUserPrompt(
  c: LessonCase,
  reading: ReadingLesson,
): string {
  const body = reading.sections
    .map((s) => `## ${s.heading}\n${s.prose}`)
    .join("\n\n");
  return `Generate one Quiz Lesson that assesses the reading below. Use only facts taught in that reading.

Course Learning Goal: ${c.learningGoal}
Lesson goal of the assessed reading: ${reading.lessonGoal}
Objectives the Quiz must cover (each objective hit by ≥1 item):
${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Assessed reading:
${body}

Rules:
- n is 5–10 items.
- Each item: one prompt, exactly four options, exactly one correctIndex (0–3).
- Distractors are plausible but wrong.
- Answerable from this reading only.
- No reading sections and no media.`;
}

export function readingJudgePrompt(
  c: LessonCase,
  reading: ReadingLesson,
): string {
  const sources = c.sources
    .map((s) => `[${s.id}] ${s.title} (${s.url})\n${s.content}`)
    .join("\n\n");
  const body = reading.sections
    .map((s) => `## ${s.heading}\n${s.prose}`)
    .join("\n\n");
  return `You are a Publish-gate Judge. You did not author this reading. Fail closed.

Quality-bar Judge checks for a reading Lesson (binary):
1. Every factual claim is supported by a retrieved excerpt from a cited Source.
2. Every slot objective is taught.
3. No generated substitute of a named copyrighted work.
4. Citation coverage: factual claims have a [Sn] whose source actually supports the claim.

Also score clarity, usefulness, and level fit 1–5 (bakeoff-only; not a Publish gate). Level fit means this Lesson matches the remaining-gap beginner scope, not an advanced treatise.

Remaining gap: ${c.remainingGap}
Lesson goal: ${c.lessonGoal}
Objectives:
${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Retrieval set:
${sources}

Reading:
${body}

Citations JSON: ${JSON.stringify(reading.citations)}

Set pass=false if any quality-bar check fails. List each failure. Do not reward style over grounding.`;
}

export function quizJudgePrompt(
  c: LessonCase,
  reading: ReadingLesson,
  quiz: { items: unknown[] },
): string {
  const body = reading.sections
    .map((s) => `## ${s.heading}\n${s.prose}`)
    .join("\n\n");
  return `You are a Publish-gate Judge. You did not author this Quiz. Fail closed.

Quality-bar Judge checks for a Quiz (binary):
1. Every Quiz-slot objective is hit by ≥1 item.
2. Each item is answerable from the assessed reading Lessons only.
3. Exactly one option is unambiguously correct.
4. Distractors are plausible but wrong.

Also score clarity, usefulness, and level fit 1–5 (bakeoff-only).

Objectives:
${c.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Assessed reading:
${body}

Quiz JSON:
${JSON.stringify(quiz, null, 2)}

Set pass=false if any quality-bar check fails.`;
}
