---
date: 2026-11-01
tickets: SEN-115
people: Ben
status: active
---

# When a required image still fails its vision check, each Lesson repair it spends tries the next-ranked catalog file

Each media block gets one vision repair: the writer rewrites its caption and alt text, using the vision Judge's reasons and the file's own catalog caption, and the vision check runs again. A required block that still fails is a Lesson defect. Each Lesson repair it spends moves that block to the next-ranked catalog file in its category that the vision Judge has not already failed, and that file gets its own vision check and caption repair. When no candidate is left, the Lesson fails at once rather than spending calls that cannot change the result. After that it goes to the fallback author, and a failure there is terminal, as with any other failed check.

**What we turned down:** having each Lesson repair ask the writer to re-place or re-describe the block (section, caption, alt) and check the same file again. That helps only when the caption was wrong, and the caption repair already covers that case. When the file itself does not show the technique, it spends repairs that cannot change the result.

**What it costs:** up to three files per required block in each author's pass, with up to two vision calls and one caption repair for each file. A required block that cannot be filled can therefore cost a dozen vision calls across both authors before the Course fails.
