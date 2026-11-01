---
date: 2026-11-01
tickets: SEN-120, SEN-119
people: Yarden
status: active
---

# Primary research stays on Parallel's `pro` processor; `core` is turned down for now

**Why:** SEN-119 ranked Parallel Pro, at $0.10 per Reading and two thirds of each Course's research spend, as a saving candidate, with the `core` processor at $0.025 as the obvious alternative. On 2026-11-01 `check:research-processors:live` researched the two test Courses' Reading topics (Gram staining; Sources, Yggdrasil and the Nine Worlds) on both processors at once, through the same Host policy. `core` returned 5 and 8 Sources where `pro` returned 10 and 13, about a third of the excerpt text (12k against 60k characters on Gram, 26k against 77k on Norse), and no time saving (114 s against 150 s, then 257 s against 202 s). Both found sound hosts. A Reading is written from those excerpts alone, so a thinner pack risks a draft the Judge sends back, at about $0.05 a repair, or a thinner Lesson. Yarden kept `pro`.

We turned down switching now (about $0.22 saved per 3-Reading Course, with the lesson pass rate as the only safeguard) and a one-Reading trial from the `core` pack (one sample would not settle it).

**What it costs:** research stays at $0.15 per Reading, about $0.45 of a 3-Reading Course and more on longer ones. The `parallel-core` adapter stays in the codebase, one config value away (`PRIMARY_RESEARCH_ADAPTER`), for when Courses grow or a Reading-quality measurement is cheap to run. Spec §5.3 is unchanged.
