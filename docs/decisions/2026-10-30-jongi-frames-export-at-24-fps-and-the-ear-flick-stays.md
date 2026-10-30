---
date: 2026-10-30
tickets: SEN-104
people: Ben
status: active
---

# Jongi's frames export at 24 fps as WebP at quality 80: every action gets a 128 px head-and-shoulders sheet, Idle and Win also get a 384 px full-body sheet, and the hover ear flick stays as its own short clip

The `.blend` is timed at 24 fps, and the export keeps every frame. The head-and-shoulders (`bust`) sheet exists for every action, at 128 px a frame. That is twice the largest avatar tile, which is 64 px. Only Idle and Win also get a whole-body (`full`) sheet, at 384 px, because the only screen that shows his whole body is course-complete, at 260 px. Each sheet is a WebP at quality 80 and loads the first time its mood shows. The `scene` framing is the full sheet with the paper circles behind it drawn by code. The hover ear flick is kept and rendered as a short clip of its own. The click squash becomes a CSS transform on the frame.

**Why:** Ben chose 24 fps over 12 fps, where each frame would have been shown twice. 12 fps would have halved the bytes and read like stop-motion paper, but the motion would have been choppier than what we tuned in Blender. Ben also chose to keep the ear flick, rather than drop it to save one more clip. The head-and-shoulders sheet is rendered at twice its largest on-screen size, so it stays sharp on high-density screens. Rendering the full body at 512 px measured 1.24 MB for the idle loop alone, so we took 384 px, which is about half that and still sharper than 260 px. Quality 90 added about a third to every sheet with no visible difference at avatar sizes. We looked at video, which could be five to ten times smaller because it stores only what changes between frames. We turned it down because Safari needs a separate HEVC file with transparency, which can only be encoded on a Mac, and because keeping the drawn pupils in sync would depend on newer browser APIs.

**What it costs:** Every sheet is twice the bytes and twice the decoded memory it would be at 12 fps. Measured: the sitting idle's head-and-shoulders sheet is 290 KB, and all the head-and-shoulders sheets come to about 1.8 MB. A typical avatar fetches idle first, then about 550 KB for reading after 20 seconds. The full-body sheets come to about 1.2 MB, and only course-complete loads them. The SVG Jongi weighed almost nothing. In the full and scene framings, idle cannot alternate to reading, because there is no full-body reading sheet, so he stays sitting there. The flick is only a clip of the sitting idle, so hover does nothing in the other moods.
