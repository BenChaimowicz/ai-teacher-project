/** How the Learner answered the Diagnostic item that probes one capability. */
export type EvidenceStatus = "correct" | "incorrect" | "dont_know" | "skipped";

/** A chosen option index, or I don't know (a non-content omit, never a scored option). */
export type DiagnosticAnswer = number | "dont_know";

/** One of the eight prerequisite capabilities, ranked by `span` from 1 (basic) to 8 (near-goal). */
export type CapabilityPlan = {
  id: string;
  statement: string;
  itemId: string;
  span: number;
};

/**
 * A scored capability. `status` is what the Learner actually answered; `expandedByLearner`
 * marks a correct answer that Too easy moved into the remaining gap.
 */
export type ProbedCapability = CapabilityPlan & {
  status: EvidenceStatus;
  expandedByLearner: boolean;
};

/** Coarse shape of the remaining gap. `insufficient_evidence` is only set by partial-abandon recovery. */
export type Extremity = "floor" | "mixed" | "ceiling" | "insufficient_evidence";

/** Blueprint input: no percent-correct, and never written to Progress. */
export type StartingLevel = {
  learningGoal: string;
  probedCapabilities: ProbedCapability[];
  remainingGapStatement: string;
  coverageNote: string;
  extremity: Extremity;
};

/** Evidenced capabilities may be treated as already in place; everything else is in the remaining gap. */
export function isEvidenced(capability: ProbedCapability) {
  return capability.status === "correct" && !capability.expandedByLearner;
}

/**
 * Floor: at most one evidenced. Ceiling: all or all but one evidenced. Otherwise mixed.
 * @param capabilities - Scored capabilities, after any Too easy
 */
export function extremityOf(capabilities: ProbedCapability[]): Extremity {
  const evidenced = capabilities.filter(isEvidenced).length;
  if (evidenced <= 1) return "floor";
  if (evidenced >= capabilities.length - 1) return "ceiling";
  return "mixed";
}

/**
 * Scores a completed diagnostic. Correct → evidenced; incorrect, I don't know, and unanswered → not evidenced.
 * @param capabilities - The attempt's capabilities
 * @param keys - Correct option index per item id
 * @param answers - The Learner's answer per item id; a missing item counts as skipped
 * @returns Scored capabilities and their Extremity
 */
export function scoreDiagnostic(
  capabilities: CapabilityPlan[],
  keys: Record<string, number>,
  answers: Record<string, DiagnosticAnswer>,
) {
  const probedCapabilities = capabilities.map((capability): ProbedCapability => {
    const answer = answers[capability.itemId];
    const status: EvidenceStatus = answer === undefined ? "skipped"
      : answer === "dont_know" ? "dont_know"
      : answer === keys[capability.itemId] ? "correct" : "incorrect";
    return { ...capability, status, expandedByLearner: false };
  });
  return { probedCapabilities, extremity: extremityOf(probedCapabilities) };
}

/** How many evidenced capabilities one Too easy press moves into the remaining gap. */
export const TOO_EASY_STEP = 2;

/** Too easy is offered while any capability is still evidenced. */
export function canExpandGap(capabilities: ProbedCapability[]) {
  return capabilities.some(isEvidenced);
}

/**
 * Too easy: moves the lowest-span evidenced capabilities into the remaining gap.
 * The Learner's actual answers stay in `status`.
 * @param capabilities - Current scored capabilities
 * @throws Error when nothing is evidenced
 */
export function expandGap(capabilities: ProbedCapability[]): ProbedCapability[] {
  if (!canExpandGap(capabilities)) throw new Error("[starting-level.ts: expandGap] Nothing is evidenced to move into the gap");
  const moved = new Set(capabilities.filter(isEvidenced).sort((a, b) => a.span - b.span).slice(0, TOO_EASY_STEP).map((capability) => capability.id));
  return capabilities.map((capability) => moved.has(capability.id) ? { ...capability, expandedByLearner: true } : capability);
}

/** Knowledge recalls a fact or definition; application uses it in a described situation. */
export type ItemKind = "knowledge" | "application";

/** One three-option, single-correct Diagnostic item with its key and one-line warrant. Server-only. */
export type DiagnosticItem = {
  id: string;
  capabilityId: string;
  kind: ItemKind;
  stem: string;
  options: [string, string, string];
  keyIndex: number;
  warrant: string;
};

/** What the browser sees of an item: no key, no warrant, no capability. */
export type LearnerDiagnosticItem = Pick<DiagnosticItem, "id" | "stem" | "options">;

/** Why one version of an item was accepted or rejected in one review round. */
export type ItemReview = {
  itemId: string;
  round: number;
  stem: string;
  codeFailures: string[];
  judge: { defensibleOptions: number[]; flaws: string[]; externalFactualClaim: boolean } | null;
  factCheck: { confirmed: boolean; reason: string; sourceUrls: string[] } | null;
  passed: boolean;
};

/** How the Learner confirmed the remaining gap. `short_course` is the thin-Blueprint choice from ceiling. */
export type GapConfirmation = "looks_right" | "short_course";

/**
 * Strips everything the browser must not see.
 * @param item - Server-side item
 */
export function learnerItem(item: DiagnosticItem): LearnerDiagnosticItem {
  return { id: item.id, stem: item.stem, options: item.options };
}
