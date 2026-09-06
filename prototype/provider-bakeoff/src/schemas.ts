/** JSON Schema used by both adapters. Strict-mode compatible. */

export const readingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "lessonGoal", "topicTags", "sections", "citations"],
  properties: {
    title: { type: "string" },
    lessonGoal: { type: "string" },
    topicTags: { type: "array", items: { type: "string" } },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "prose"],
        properties: {
          heading: { type: "string" },
          prose: {
            type: "string",
            description:
              "Learner-facing paragraphs. Cite with [S1], [S2], … immediately after the supported sentence.",
          },
        },
      },
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "usedAs", "quotedText"],
        properties: {
          sourceId: {
            type: "string",
            description: "Must be one of the provided source IDs such as S1.",
          },
          usedAs: { type: "string", enum: ["quote", "paraphrase"] },
          quotedText: {
            type: ["string", "null"],
            description: "Exact excerpt text if usedAs is quote; otherwise null.",
          },
        },
      },
    },
  },
} as const;

export const quizSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "options", "correctIndex", "explanation"],
        properties: {
          prompt: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 4,
          },
          correctIndex: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;

export const judgeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "pass",
    "failures",
    "clarity",
    "usefulness",
    "levelFit",
    "notes",
  ],
  properties: {
    pass: { type: "boolean" },
    failures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["check", "detail"],
        properties: {
          check: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    clarity: { type: "integer", minimum: 1, maximum: 5 },
    usefulness: { type: "integer", minimum: 1, maximum: 5 },
    levelFit: { type: "integer", minimum: 1, maximum: 5 },
    notes: { type: "string" },
  },
} as const;
