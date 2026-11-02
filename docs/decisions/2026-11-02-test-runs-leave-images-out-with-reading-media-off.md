---
date: 2026-11-02
tickets: SEN-124
people: Yarden
status: active
---

# Test runs leave images out with `READING_MEDIA=off` while media is still being designed

**Why:** The regular-tier run stopped Gram twice on one Lesson. Its only fitting library image, an unlabelled microscope drawing, failed the vision check because the writer, who cannot see it, promised labels. Nothing in that failure is about research, and Yarden judged media not fully thought through yet. `READING_MEDIA=off` gives Reading generation no media library, so no image is offered and none is required, even on slots the Blueprint marked. The default stays `on`, so production behaviour is unchanged.

We turned down fixing the media failure inside SEN-124 (giving the writer the file's own caption, or adding a labelled microscope image). That is media design work and belongs in its own ticket. We also turned down retrying until the Lesson happened to pass, which would only hide the cause.

**What it costs:** test Courses run with `off` say nothing about images. Their Readings never show one, and their cost leaves out the vision calls. Media needs its own test run once it is designed.
