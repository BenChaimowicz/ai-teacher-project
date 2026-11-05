---
date: 2026-11-05
tickets: SEN-143, SEN-147
people: Ben
status: active
---

# The illustrator plans scenes on Terra at medium effort, with Sol as its fallback, for now

**Why:** The SEN-143 eval ran 14 stored briefs through the production illustrator loop on each candidate (`docs/research/sen-143-illustrator-models.md`). Under the strict Vision Judge (`gpt-6-luna`), Terra at medium matched Sol at medium: 9 of 14 first plans passed, and 13 of 14 briefs were illustrated. Terra did it at $0.021 a picture against $0.045, and about 10 s faster. The pictures look comparable.

**What we turned down, and why:**
- **Sol at medium:** the same pass rate for twice the money.
- **Luna:** 6× cheaper again, but as an author it may not judge its own plans (ADR 0015). Every illustration would then move to the lenient `gpt-5.6-luna`, which passed 30 real defects the strict Judge caught. Its pictures were also visibly weaker: blank blocks for worlds, and the serpent block standing in for Fenrir.
- **GLM 5.3 Flash:** 0–3 of 14 first plans, with timeouts.
- **Kimi K3.1 Pro:** Sol's price, no better.
- **A text-to-image model:** the best-looking pictures, but Google's filter refused 3 of 14 myth briefs, only 9 of 14 were illustrated, and it ignores the house style. It would also reverse the 2026-11-03 decision.

**The cost:** Terra's scenes are sometimes a little plainer than Sol's. "For now" because the next gains are expected from the house style and building blocks themselves, not the model (SEN-147). The pick should be re-measured with `pnpm check:illustrator-models:live` once those change.
