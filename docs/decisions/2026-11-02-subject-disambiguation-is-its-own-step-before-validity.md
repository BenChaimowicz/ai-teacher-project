---
date: 2026-11-02
tickets: SEN-124, SEN-90
people: Yarden
status: active
---

# Subject disambiguation is its own step, on Luna, before the Validity gate

**Why:** A subject as typed can mean several things ("Mercury", "Java", "Gram"), and today the Validity gate and Goal focusing both work from that text. Right after Compose, a cheap model (Luna) lists the subjects the Learner may have meant. When there is only one reading, nothing is shown. Otherwise the Course Guide offers them as options, plus **None of these** with a free-text answer. Validity and focusing then see a settled subject.

We turned down making it the first question of Goal focusing. That needs no new status, but Validity would still judge the unsettled text, and focusing runs on Sol, not Luna. We also turned down folding it into Validity's clarification. That mixes meaning into the learnability gate, against ADR 0020's split, and spends the Request's only clarification.

**What it costs:** a new Course Request status and one Luna call per Request, under a cent. Learners whose subject is ambiguous answer one more question. Spec §4.2 gains the step.
