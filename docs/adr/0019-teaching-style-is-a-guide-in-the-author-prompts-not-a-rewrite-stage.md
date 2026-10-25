# Teaching style is a guide in the author prompts, not a rewrite stage

Generated Readings were grounded but read like summaries of their excerpts. The recorded SEN-43 Reading (`docs/research/sen-43-norse-reading-run.json`) is cited fact after cited fact: no reason to care, no example, nothing asking the Learner to think. SEN-80 proposed a "teacher agent" stage after each Lesson passes: rewrite every Learner-visible sentence in a teaching voice, then run the grounding Judge and the Quiz checks again.

Instead, the authors write to a style guide from the start (`apps/api/src/lib/teaching-style.ts`). The Reading author opens with why the Lesson matters, builds each idea from a case and its principle, gives worked examples from the excerpts, signposts between sections, ends sections with a question the section answers, and ends the Lesson with a cited recap. The Quiz author writes plain prompts, prefers invented situations that put an idea to use, and writes explanations that start from the idea that makes the answer right. Both share one voice (`TEACHING_VOICE`), and a Reading repair writes its replacements in it. Blueprint titles name the idea a Lesson teaches, never a label.

The style guide adds structure and explanation, never facts, so the grounding rules are unchanged. The one new allowance is analogies and plainly invented examples, which need no Citation as long as they state no fact about the subject. The author and the reading Judge are given the same wording of that rule (`ILLUSTRATION_RULE`), so they decide it alike (ADR 0016). The Quiz Judge accepts an invented situation whose keyed answer follows from the Lessons alone.

Rejected:
- **A rewrite stage after the Judge passes.** Every Lesson would pay one more author call and one more Judge call, about 5 minutes per Reading at high effort (ADR 0010). It would also rewrite every sentence of a Lesson that had just passed. ADR 0016 shows what that does: whole rewrites added new unsupported claims as fast as they removed old ones. A rewrite that fails would need its own repair or fallback path, which is a second pipeline for the same Lesson.
- **Asking the Judge to check teaching quality.** A Judge failing Lessons for style would spend the repair budget on wording, and the repair prompt edits only what problems name. The Judge still fails only clear problems, not style.

Not yet measured: whether Lessons written to the guide fail the Judge more often. Analogies and recaps are new places for an unsupported claim to appear.
