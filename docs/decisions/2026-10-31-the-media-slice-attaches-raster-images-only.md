---
date: 2026-10-31
tickets: SEN-55, SEN-115
people: Ben
status: active
---

# The media vertical slice attaches only raster images (JPEG, PNG, WebP, GIF); SVG waits for SEN-115

The vision-fitness check sends the image to a vision model, and those take raster images, not SVG. In SEN-55, library lookup considers only raster descriptors, so the five product-owned SVG diagrams in the seed catalog (drum notation and kit anatomy) are never picked yet. SEN-115, where the drum Course needs notation diagrams, owns rasterizing SVG for the vision call. The seed already refuses an SVG with scripts, `foreignObject`, event handlers or remote references (SEN-47).

**What we turned down:** adding a rasterizer such as `@resvg/resvg-js` now. It would make every catalog file attachable today, but it adds a native dependency to a ticket that only has to prove one optional image end to end.

**What it costs:** a Reading that asks for a notation or kit diagram gets no image until SEN-115 lands. For an optional block that is a dropped figure, not a failed Lesson.
