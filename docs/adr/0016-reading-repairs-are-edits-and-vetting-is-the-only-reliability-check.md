# Reading repairs are edits, and vetting is the only reliability check

A Reading repair used to rewrite the whole Lesson from the Judge's problems. The author fixed the claims it was told about and wrote new unsupported ones elsewhere, so each repair was close to a fresh draw rather than progress. On 2026-10-24 (SEN-49), Yarden's Norse Course failed Reading after Reading and passed only on Retry. Replaying one of those Readings with the stored Source packs showed it plainly. Draft 1 had 6 unsupported claims, repair 1 had 3 different ones, and repair 2 had 3 new ones again. The draft that "golden apples" was cut from got it back on the next rewrite.

A repair now returns edits, not a Lesson. Each edit copies one passage of the previous draft exactly and gives its replacement, or cuts it. The code applies them, and every sentence no edit touches stays verbatim. An edit whose text is not in the draft exactly once is skipped, and the next repair is told which ones were skipped. A repair whose edits all missed is not judged again: the next repair gets the same problems, and the last real verdict stays the failure. The first draft and the repair share one set of grounding and citation rules. The repair budget (spec §6.1) is unchanged.

Replaying the same Reading twice with each version (same packs, same models):

| | Run 1 | Run 2 |
|---|---|---|
| Whole rewrites | failed after 3 drafts, 315 s | passed after 2 repairs, 338 s |
| Edits | passed after 1 repair, 181 s | passed after 1 repair, 181 s |

A repair now takes 16–60 s instead of 44–105 s, because the reply is a few edits instead of a Lesson.

The same replay showed a second fault. Vetting kept a commercial blog before writing, and the reading Judge then failed the Lesson for citing it (`unreliable_source`), which cost a repair. Both were deciding the same question from slightly different wording and slightly different evidence. Now vetting decides alone, from one definition (`UNRELIABLE_SOURCE`). The author is told every Source it is given may be cited, and the reading Judge no longer has an `unreliable_source` check. This reverses spec §5's "the reading Judge still fails `unreliable_source` as a backstop."

Edits do not make an objective the Sources cannot support teachable. A slot whose objective needs evidence its packs lack still fails `objective_coverage`, and adding sentences for it is where new unsupported claims still appear.

Rejected:
- **Asking the Judge to name the section for each problem and rewriting only those sections.** That needs a new Judge result shape across every stage, and a rewritten section still adds new claims inside it.
- **Keeping the backstop with a shared definition.** Two calls with different evidence (the opening excerpt against every excerpt) still disagree on borderline pages, and the disagreement surfaces after a Lesson is written, which is the costly time.
- **Raising the repair budget.** More rewrites are more draws from the same distribution; they cost minutes and do not converge.
