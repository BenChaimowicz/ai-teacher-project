import type { JudgeResult } from "@senoy/db/blueprint";
import { ModelError } from "./openrouter.ts";

/**
 * Strict JSON schema for a binary Judge verdict (spec §6.1) whose failed checks come from `checks`.
 * Reasons come first so the Judge writes them before it commits to `pass`.
 * @param checks - The checks this Judge may fail
 */
export function judgeSchema(checks: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["reasons", "failedChecks", "pass"],
    properties: {
      reasons: { type: "array", items: { type: "string" } },
      failedChecks: { type: "array", items: { type: "string", enum: checks } },
      pass: { type: "boolean" },
    },
  } as const;
}

/**
 * Parser for a Judge verdict. Any failed check fails, whatever `pass` says.
 * @param checks - The checks this Judge may fail
 */
export function judgeParser(checks: readonly string[]) {
  return (raw: unknown): JudgeResult => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ModelError("invalid_output");
    const row = raw as Record<string, unknown>;
    if (typeof row.pass !== "boolean" || !Array.isArray(row.failedChecks) || !Array.isArray(row.reasons) ||
        row.failedChecks.some((check) => !checks.includes(check as string)) ||
        row.reasons.some((reason) => typeof reason !== "string")) throw new ModelError("invalid_output");
    const failedChecks = [...new Set(row.failedChecks as string[])];
    return { pass: row.pass && failedChecks.length === 0, failedChecks, reasons: row.reasons as string[] };
  };
}
