---
date: 2026-11-02
tickets: SEN-124, SEN-120
people: Yarden
status: active
---

# The research tier is picked after Goal focusing: Luna rates the topic on a rubric and code decides

**Why:** Every Reading gets the same $0.15 of research, whether the topic is well trodden or niche. Once the goal is focused, Luna rates the focused goal and its scope on a rubric: niche or scholarly versus mainstream, and how dense it is in dates, names and procedures. The rating is structured output, and a code rule turns it into the tier. This is the same pattern Goal focusing's Detect uses, so the model gives evidence and never the verdict. The tier is stored on the Course Request, so the Usage Console can show it and SEN-120's before-and-after can measure it.

We turned down rating the subject in the same Luna call as disambiguation. That saves a step, but it judges before the goal and scope are known. We also turned down letting the Learner choose deep research, which pushes a cost decision onto them.

**What it costs:** a second Luna call per Request, under a cent. A wrong rating sends a niche topic to the cheaper tier. The Judge and repair loop catch a thin draft, at about $0.05 a repair.
