---
date: 2026-11-04
tickets: SEN-125, SEN-131
people: Ben
status: active
---

# The Starting Level check stays eight fixed items with one search per claim; the 5-minute limit is fixed by taking the build off the request, not by changing the check

**Why:** SEN-125 asked whether the check should become a decision tree, where each answer picks the next question, built from one upfront search of the subject instead of one search per claim. The idea was priced against the check before SEN-120 and SEN-122: 13 to 15 searches and 2.5 to 5 minutes. Measured on 2026-11-04 over the checks since Sol became the author, a check makes 6 to 8 searches at $0.005 each, costs $0.06 to $0.09 and is ready in 84 to 138 s when the first set passes. The time goes to model calls: every Sol set so far has needed a rewrite round, and 12 of the 13 Judge failures were implausible distractors. The keys are not the problem: the Judge disputed none of 53, and the fact-check confirmed 34 of 34.

We turned down:
- **The decision tree.** Its output is a path, which encodes a position, which is the band spec §4.3 forbids. A capability that is never asked can never be marked in place, so it lands in the gap unprobed. The only pruning §4.3 allows is toward the floor, where Learners already answer I don't know in seconds. Fifteen to twenty items would also about double the check to $0.14 to $0.18 and 230 to 330 s, straight into Railway's limit.
- **One upfront pack.** It costs about what the searches it replaces cost, runs before the author instead of in parallel after the Judge, shortens no rewrite round, and gives the author and the Judge the same evidence, which weakens the Judge's independence (ADR 0015). The replay measurement the ticket asked for (34 stored claims against one pack per goal, about $0.20) was not run, because even a perfect score would not make the pack cheaper or faster.
- **Reusing the Course's research.** It runs per Reading slot after the Blueprint is approved and only for Lessons in the gap, so it cannot precede the check and would not cover the capabilities the check must probe hardest.

**What we do instead:** SEN-131, in order: answer the prepare request at once and build the check in the background under the ADR 0023 lease, which the browser's 3-second poll already handles; let the fallback author rewrite only the failing items instead of a whole new set; add the Judge's distractor rule to the author prompt. Each step is measured with the live check. Showing the first question before the whole set is checked stays in reserve.

**What it costs:** The check keeps its 1.5 to 2.5 minute wait for now, and the Learner keeps seeing the preparing screen for that long. The $0.20 pack measurement stays unrun, so the question of whether pack-grounded keys pass the Judge as often stays open on paper.
