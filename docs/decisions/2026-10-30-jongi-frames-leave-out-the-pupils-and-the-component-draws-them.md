---
date: 2026-10-30
tickets: SEN-104
people: Ben
status: active
supersedes: 2026-10-29-jongi-ships-as-rendered-frames-with-a-look-at-grid
---

# Jongi ships as pre-rendered frames with the pupils left out, and the component draws the pupils and slides them toward the pointer

Blender still hands the web app one sprite sheet per mood, rendered flat through the orthographic camera so it reads as cut paper. What changes is look-at. The frames are rendered without pupils, and the export writes a small data file beside each sheet. That file says, for every frame, where each pupil sits and whether the eyes are open. The component draws the two pupils and their shine on top of the frame, at the positions from the data. With `track` on, it also slides them toward the pointer, the way the SVG Jongi does today. Wherever the data says the eyes are closed (blinks, Resting, Win's happy eyes), no pupils are drawn, and the closed-eye shapes come baked into the frame.

**Why:** The earlier plan was a small rendered grid of eye directions. His idle loop bobs and blinks, so a single still frame per direction would freeze him. The grid would really have meant rendering the whole idle loop once per direction, which is nine copies of the idle sheet for a 3×3 grid, and the eyes would still have moved in steps. Drawing the pupils keeps look-at continuous at almost no cost in bytes. It also carries the pupils' own animation, such as the scanning while he reads, through the same data. glTF with three.js stays turned down, for the reasons in the entry this replaces.

**What it costs:** The pupils are drawn by code rather than rendered, so their paper drop shadow is faked in CSS. Their colours and size have to be kept in step with the render by hand. Every export has to produce the eye data along with the sheets, and the component has to read it. Layer parallax has no separate layers left to shift, so `parallax` can only nudge the pupils or the whole picture.
