---
date: 2026-10-29
tickets: SEN-104
people: Ben
status: superseded
---

# Blender hands the web app pre-rendered frames: a sprite sheet per mood plus a small grid of head and eye angles for look-at

The `.blend` file is the source. The browser gets images rendered from it through an orthographic, flat-shaded camera, so the result reads as cut paper. Each mood loop and the Win one-shot is a sprite sheet. Pointer look-at picks the nearest frame from a small rendered grid of head and eye angles, instead of moving parts continuously.

**Why:** It keeps the existing `Jongi` props and framings and needs no 3D runtime, which serves the ticket's "lightweight asset" requirement. We turned down glTF with three.js, which keeps continuous look-at and every angle but adds a renderer and a model to pages that ship neither today, and would let the look drift toward a lit, rounded 3D character. We also turned down frames alone, which are lighter still but drop look-at entirely.

**What it costs:** Look-at moves in steps rather than continuously. Parallax is limited to what the rendered angles show. Every change to the character means re-rendering and re-exporting the frames. The grid size trades smoothness against bytes on the page, and we have not picked it yet.
