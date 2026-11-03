---
date: 2026-11-03
tickets: SEN-121, SEN-128
people: Yarden, Ben
status: active
---

# Illustrations are drawn in TypeScript with SVG, Rough.js and resvg, inside the existing worker

**Why:** A side-by-side prototype drew the same three pictures (Yggdrasil, the Gram stain steps, a drumstick grip) in both candidate engines, in the papercraft house style. Both met the style and drew depictions and diagrams well, so the look was a tie. We turned down Python with pycairo, even though it rendered faster (about 0.4 s per image against about 1.1–1.4 s) and its Yggdrasil read more cleanly. It would add a second language and a separate service to host and keep alive while hosting (SEN-106) is still undecided. With TypeScript, the scene plan, its validation and the pipeline stay in one language. The cost is the slower render, which is small next to the model calls around it and drops to about 0.5 s once the paper grain is drawn once and reused.

Both prototypes also showed that hands made from free-form building blocks come out as stiff mittens, so technique pictures are not solved by the engine choice.
