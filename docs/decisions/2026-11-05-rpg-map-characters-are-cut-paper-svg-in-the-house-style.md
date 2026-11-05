---
date: 2026-11-05
tickets: SEN-144
people: Ben
status: active
---

# The RPG map's characters and markers are cut-paper SVG in the house illustration style, and Readings huddle into regions between Quiz mini bosses

**Why:** The base map Ben chose is cut-paper, and the whole app is papercraft (SEN-86, SEN-97). Markers drawn in the same style, as hand-written SVG in the look of `packages/illustration`, sit on that map as one picture and scale to any marker count. We turned down pixel-art sprites from Aseprite: "old-school RPG" suggests them, but pixels on a cut-paper map read as two games glued together. We turned down Blender renders as far more work than a cosmetic marker earns. We also turned down generating the art with an image model, which the ticket already forbids per Course.

Ben also asked that the Readings between two Quizzes huddle close together as one region of the map, with the Quiz as a mini boss at the region's edge, instead of spacing every Lesson evenly. A real 16-Lesson Course then reads as four or five places on a journey, not sixteen equal dots. The prototype shows both placements side by side so we can compare before Study gets one.

**The cost:** Hand-drawn SVG is slower to make than a generated sprite, and a new theme needs a new set drawn by hand. Clustered placement is uneven on purpose, so a short Course with few Quizzes may bunch at one end of the route; even placement stays as the fallback.
