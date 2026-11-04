---
date: 2026-11-04
tickets: SEN-81, SEN-79
people: Yarden
status: active
---

# A "not met" Goal Check asks the Learner what was missing, then lets them start a new Course built from it, or do nothing

**Why:** The score alone tells us which objectives were missed, but not why the Course fell short for this Learner. So after a "not met" result we first ask for feedback: multiple-choice reasons plus a free-text option for what was missing. Then the Learner picks the next step: start a new Course Request prefilled with what was missing, or do nothing. We turned down routing every "not met" straight into the adaptive-Course loop (SEN-79), and we also turned down always suggesting a new Course. Either one picks for the Learner and throws away their own account of the gap. We also considered a third choice, adding Lessons to the current Course, and dropped it: a published Course is generated once from an approved Blueprint, and appending Lessons to it would be a whole new plan, research, write, Judge and publish path, about as big as the rest of SEN-81. The cost is an extra feedback step at a moment of failure, and a Learner who wanted the gap filled in place has to start a new Course instead.

**Scope:** only a "not met" result gets this flow for now. A "partly met" result shows the missed objectives and links back to their Lessons, but asks nothing. We can widen it later if "partly met" Learners turn out to need it too.

**The fixed feedback reasons:** "Too advanced for me", "Too basic", "Missing a topic I needed", "Too theoretical, not practical enough", plus a free-text "Something else" option. The Learner can pick more than one.
