---
date: 2026-11-03
tickets: SEN-48
people: Yarden
status: active
---

# "I've read it" completes the Lesson and opens the next one in the same click, and every screen opens at the top

**Why:** Reading the fourth SEN-48 Course, Yarden found the walk from Lesson to Lesson took two clicks (**I've read it**, then **Next Lesson** on the finish line) and that each new Lesson opened where the last one ended, scrolled to the bottom, because the content area, not the window, is what scrolls, so the browser never reset it. Six Readings in a row made both annoying, and the stale scroll had a quieter bug: the new Lesson's section ticks and "Halfway" were judged at the old position for a moment.

**One click.** The end-of-Lesson prompt's primary tile now says where it leads and goes there: **I've read it, next lesson** with the next Lesson's title, **I've read it, start the quiz**, or **I've read it, finish the course** after the last Lesson once everything counts. It completes the Lesson first, lets the "lesson read" cheer play for a moment, then opens the next screen; a failed completion shows its message and stays, so nothing moves on unrecorded. **Not yet, stay here** is unchanged. Where the tile leads is computed ahead of completion from the Course as it will be once this Lesson counts, by the same rule as the finish line (`nextLessonId`, then Finish Course when nothing is left), in one function both read. A revisited, already complete Lesson still shows the finish line with Next Lesson and Back to Home. The Quiz keeps its two steps on purpose: Submit shows the score and the answers, and the Learner reads them before Next Lesson. The spec's "never auto-advance" stands: moving on is still the Learner's click, only there is one of them. This is what the redesign mock had ("I've read it, start the quiz") before the finish line was bolted on after it.

**Top of the page.** The app shell scrolls its content area to the top whenever the route changes, in a layout effect so it lands before a screen's own scroll handlers read the position. Every screen gets it, not only Study, because a new page starting at the top is what a browser does and what the Learner expects.
