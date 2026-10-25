# Lessons are written by Sol, with DeepSeek as fallback

Readings and Quizzes now have their own author pair: `openai/gpt-6.1-sol` writes them, and `deepseek/deepseek-v4-pro` is their fallback (`LESSON_GENERATOR_MODEL`, `LESSON_GENERATOR_FALLBACK_MODEL`). Every other stage keeps DeepSeek first and Sol as fallback. Luna still judges; when Sol wrote the artifact, the Judge's own fallback (Sol) is ruled out as before (ADR 0015).

On 2026-10-24 and 25 (SEN-49), DeepSeek passed none of its 11 Lesson first drafts. Of 8 Readings, 1 passed after both repairs and 7 failed outright. Of 3 Quizzes, 2 passed after both repairs and 1 failed. The Judge's reasons were almost all the same kind: background knowledge the excerpts do not state, such as "thunder god" for Thor, "rainbow bridge" for Bifröst, Baldr dreaming "of his own death", or a stanza absent from "the oldest manuscript" where the excerpt names the Codex Regius. The prompt already forbids this ("even ones you believe are true"). Once ADR 0017 let Sol write a fresh draft after DeepSeek's repairs ran out, Sol's first draft passed all 3 times.

| Author | Calls per Lesson | Time per Lesson | Cost per Lesson (author + Judge) |
|---|---|---|---|
| DeepSeek | draft, 2 repairs, 3 Judge calls | 3.5–6.5 min | about $0.14, usually still failing |
| Sol | draft, 1 Judge call | about 1.5 min | about $0.12 |

So DeepSeek first costs about what Sol costs, takes two to four times longer, and mostly ends in Sol anyway or in a failed Course. Three Sol drafts are a small sample. If Sol's first drafts fail more often, the cost per Lesson rises; the `rounds` on each Reading's Pipeline Event show it.

The Generator's preferred hosts (`GENERATOR_PROVIDER_ORDER`, measured for DeepSeek on Alibaba) now go with the Generator model in whichever role it writes, so DeepSeek keeps them as the Lesson fallback, and Sol gets OpenRouter's default routing in both roles.

Quizzes also get the fallback that ADR 0017 gave Readings: after the Lesson writer's two repairs, the fallback writes a fresh Quiz from the same Lessons with its own two repairs. The run that prompted this lost a Course at its last Quiz over one word ("euhemerized") in one explanation.

Rejected:
- **Sol for every stage.** Validity, the Starting Level set, and the Blueprint pass on DeepSeek; the measurement is only about Lessons, where text must stay inside the excerpts.
- **Falling back after the first failed draft, DeepSeek still first.** Each Lesson would still spend a DeepSeek draft and Judge call that almost always fails.
- **A stricter author prompt.** It already says the rule plainly; the data above is the model not following it.
