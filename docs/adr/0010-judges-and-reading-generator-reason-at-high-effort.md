# Judges and the reading Lesson Generator reason at high effort

Every Judge call (Luna, or its fallback) runs at `reasoning.effort: "high"` by default; the Judge port sets it unless a request sets its own. The reading Lesson Generator also runs at `"high"`; other Generator calls keep their own settings. Judges no longer pin `"none"`: the spec and the Judge research had asked for it, but nobody remembers deciding it.

The first real runs used a 2,000-token author cap and a Judge with no reasoning, as the Blueprint calls did (SEN-43, 2026-10-13). None of ten runs produced a passing Lesson, even with one Judge-informed repair, the fallback writer, and prompt tightening. The author kept stating the excerpts more strongly than they did. The Judge returned verdicts that contradicted their own reasons: one said "No clear claim-support failure is present" and still failed. Checking claim support means comparing each sentence against the cited excerpts, and that comparison is reasoning work. At high effort, the first two runs passed. With the final prompts and Source vetting, two of three passed, one of them after its single repair. The failure was two narrow overstatements, which the second repair spec §6.1 allows (SEN-57) may catch. A run takes about 1.5–4 minutes instead of under 1, and hidden reasoning is billed as output.

Judge independence is unchanged: the Judge is still a different model ID from the author. Reasoning effort is a call setting, not a model choice.

Rejected:
- **Keep tuning prompts at no reasoning.** Each tweak fixed one failure and surfaced another.
- **Relax `claim_support` to fabrications only.** That weakens the grounding gate the Lesson exists to pass.
