---
date: 2026-10-30
tickets: SEN-94, SEN-49
people: Ben
status: active
---

# The Blueprint author and Judge no longer see the remaining-gap statement; they design from the capability lists alone

The Norse Request from SEN-49 had a remaining-gap statement that read "Your course will start with Loki's shifting role in the myths and the story of Baldr's death, then explore how different source traditions…". The author took that as the Lesson order. With `main`'s prompts, one of three replays passed the Judge in exactly that order, with no Lesson on cosmology or the gods. A prompt line telling the author to ignore the statement's order wasn't enough: the first drafts still opened with Loki and Baldr.

**Why:** The statement is written for the Learner, and it is generated from the same `inPlace` and `remainingGap` lists that both roles already get. So it gives the author no extra facts, only an outline. We considered keeping it behind a "not an outline" instruction and turned that down, because the model kept following it anyway. What it costs us: the Course may no longer start where the confirmation screen said it would. The Learner confirmed "Your course will start with Loki…" and may then get a Course that starts with creation and the gods. We accept that, because the statement is a summary of the gap, not a promise about the order. This entry goes with the new `natural_order` Judge check and the sharper `prerequisite_order` check.
