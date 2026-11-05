---
date: 2026-11-05
tickets: SEN-144
people: Ben
status: active
---

# The RPG map's path and locations are drawn in code along one hand-drawn route per map, not from prebuilt animations per Lesson count

**Why:** Each of the three abstract maps carries one hand-drawn route, saved as an SVG path. Study places one location per Lesson, plus the Goal Check, at even spacing along that route. The path animates by drawing itself (stroke-dashoffset), and each location appears when the path reaches it. Progress is the path drawn up to the current Lesson. We turned down prebuilt overlay animations, one per Lesson count. That is many art assets, and a set for 1–24 Lessons would not cover our real range: a Course has 3–30 Lessons plus the Goal Check (`MAX_COURSE_LESSONS` in `packages/db/src/blueprint.ts`), so up to 31 locations. Drawing in code covers any count, and still works if the cap changes.

**The cost:** Locations are evenly spaced, so they look less hand-placed. Long Courses pack markers close together, which may be tight on a phone. If a prototype looks crowded, we add a short, medium and long route per map, picked by Lesson count, and make Quiz and boss markers bigger so the route has landmarks.
