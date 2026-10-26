# Goal focusing is its own step after Validity, and a confirmed focus rewrites the Learning Goal

A learnable but broad Learning Goal passed Validity as written, and every later stage guessed which part of the subject the Learner meant (SEN-90, seen on SEN-49 Norse runs: a diagnostic probe on source criticism grew into a whole Reading the Sources could not support). We added **Goal focusing** between Validity **pass** and the Starting Level diagnostic, with its own statuses: `awaiting_focus_answers`, `awaiting_focus_confirmation`, and `goal_focused`, from which the diagnostic starts.

**Own step, not a Validity outcome.** Validity's one clarification settles learnability and feeds a policy decision (pass, clarify, reject) under a versioned policy. Focusing settles scope, takes up to three rounds, and can always be skipped. Folding it into Validity would put a multi-round, skippable conversation inside a policy gate and make every focusing change a policy-version change. The first focusing turn starts by itself after a pass, so a precise goal costs one model call and no Learner turn.

**Precise is decided in code.** The Generator rates facet, depth or purpose, and finish line as booleans; code treats the goal as precise only when all three hold (ADR 0011's "state it in structured output and check it in code"). Round, question, and option bounds are checked at the parse seam, so a reply that breaks them is retried, then falls back (ADR 0015).

**A confirmed focus rewrites `learning_goal`.** The goal as typed, the rounds, and the confirmed scope are kept in `course_requests.focus`. Every existing consumer (diagnostic, Blueprint, Readings, Quizzes, Library, Study) already reads `learning_goal`, so they get the focused goal without a second field to choose between. Only the stages that must exclude facets read `focus.scope`: the diagnostic, the Blueprint author and Judge, research topics, and the whole-Course Judge. A broad overview keeps the typed goal and stores no scope.

This amends ADR 0014 in one detail: a diagnostic whose preparation was lost returns to `goal_focused`, not `validity_passed`.

Rejected:
- **Keep `learning_goal` as typed and add `focused_goal`.** Every consumer would have to pick one, and a missed one would quietly design against the broad goal.
- **Derive the step from whether focus rows exist.** Our statuses are explicit enum values; a derived status cannot be updated conditionally.
- **Carry the focus record into Revise request and Change my goal.** The new draft gets the current goal as editable text and runs Validity and focusing again. An already focused goal is usually precise, so it passes straight through, and an edited one is focused afresh.
