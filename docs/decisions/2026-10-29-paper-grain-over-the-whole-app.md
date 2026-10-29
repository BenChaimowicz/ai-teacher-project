---
date: 2026-10-29
tickets: SEN-97
people: Yarden
status: active
---

# A faint paper grain lies over the whole app

**Why:** Yarden wanted the papercraft theme to feel a bit more like real paper. Grain is the one touch that suits every surface. A single fixed layer on `body::after` (fractal noise, soft-light, 9% opacity) adds it without changing any component's styles, and it ignores clicks. It costs one full-screen blended layer. Removing it means deleting one rule in `index.css`. Bigger touches (dog-ears, tape, torn edges, an askew sheet underneath, stitching) go only on components we pick, not everywhere.
