# A Reading whose repairs run out is rewritten by the fallback author

A Reading used to fail once its first draft and two repairs failed (spec §6.1). On 2026-10-24 (SEN-49), Ben's Norse Course failed its first Lesson twice in a row, each time after DeepSeek's draft and two repairs. Both runs failed on one sentence about Baldr's dreams that no objective asked for. DeepSeek wrote it from its own knowledge, stronger than any excerpt, and neither repair cut or softened it. The research was sound: 31 Sources, one of which says almost the same thing in milder words.

A Reading now gets a second author. When the primary author's repairs run out, the fallback author writes a fresh first draft from the same vetted Sources, with its own two repairs. That was Sol (`GENERATOR_FALLBACK_MODEL`) behind DeepSeek; ADR 0018 then swapped the two for Lessons and gave Quizzes the same fallback. This is what the Starting Level set already does after its rewrite rounds fail (spec §4.3), and it uses the same `fallbackGenerator` port (ADR 0015). The fallback writes from scratch rather than repairing the failed draft: the failed draft is the primary's, and repairing it would leave its claims in place and make both models its authors. The Judge for the fresh draft rules out only the fallback, since no primary text is left in it. No fallback is used when none is configured, or when it is the primary model.

Each draft and repair is now recorded in the Reading's Pipeline Event as `rounds`. Each round has the model that wrote it, the first draft's sections with Source ID markers or a repair's edits and the edits that matched nothing, and the problems that failed it. Rejected drafts are stored nowhere else. Without them, the two failures above could not show whether the repairs missed the sentence, softened it too little, or added new problems.

Vetting runs once, before either author writes, so both authors see the same Sources.

Rejected:
- **Raising the repair budget.** ADR 0016's replay showed more repairs are more draws from the same model; the failures above were the same model making the same mistake.
- **The fallback repairing the failed draft.** It would keep the primary's text, so the fallback would be fixing problems it did not make, and the Judge would have to rule out both models.
- **Retrying the whole Lesson on the primary.** That is what Retry already does, and it failed the same way.
