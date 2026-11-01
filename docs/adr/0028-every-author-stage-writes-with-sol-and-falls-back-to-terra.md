# Every author stage writes with Sol and falls back to Terra; DeepSeek is gone

This supersedes ADR 0018. Every author stage, validity, goal focusing, the Starting Level set and its gap statement, the Blueprint, the reuse fit, Readings and Quizzes, now writes with `openai/gpt-6.1-sol` and falls back to `openai/gpt-6.1-terra` (`GENERATOR_MODEL`, `GENERATOR_FALLBACK_MODEL`, `LESSON_GENERATOR_MODEL`, `LESSON_GENERATOR_FALLBACK_MODEL`). The Lesson pair stays a separate setting so Lessons can be pinned apart again if a measurement ever asks for it, but both pairs default to the same models. `deepseek/deepseek-v4-pro` is not called anywhere, and the Alibaba host pin that existed only for it (`GENERATOR_PROVIDER_ORDER`, ADR 0018) is gone with it: every author gets OpenRouter's default routing, and the transport's `provider` block is `require_parameters` alone.

The Judge stays `openai/gpt-6-luna`. Its fallback is now `openai/gpt-5.6-luna`, the previous Luna generation, instead of Sol. ADR 0015 lets the Judge use any model that wrote no part of the artifact; with Sol writing every stage, a Sol fallback could never judge a Lesson, so Lesson judging had no working fallback at all. `gpt-5.6-luna` is never an author, takes images for the vision check, and supports structured outputs.

Why DeepSeek goes, measured:

- **Lessons** (SEN-49, ADR 0018): DeepSeek passed 0 of 11 Reading first drafts; Sol passed its 3, then 13 of 15 Readings and 14 of 15 Quizzes across the five Courses published since (SEN-119).
- **Starting Level sets** (SEN-119, SEN-122): DeepSeek's set failed all three review rounds in 4 of the last 5 diagnostics (draw a cat, drum kit, Gram, Norse), re-offending each round on deterministic item-writing checks ("the key repeats a distinctive stem word the distractors lack", "the key must not stand out as the longest option") or on keys the Judge disagreed with. Sol then wrote a new set, so the discarded set's author calls and its You.com fact-checks, $0.33 to $0.38 a Course, were paid for nothing.
- **Structured output** (SEN-122): over 30 days of `usage_records`, DeepSeek returned invalid output on 4 of 139 calls; Luna on 0 of 305 and Sol on 0 of 73.

Prices on OpenRouter, read from its model list on 2026-11-01, USD per million tokens in / out: Sol 2 / 10, Terra 1 / 5, Luna 0.10 / 0.50, `gpt-5.6-luna` 0.20 / 1.20, DeepSeek v4 pro 1.60 / 3.20 at list (our Alibaba host charged about 0.40 / 3.40). All four OpenAI models support `response_format`, `structured_outputs` and `reasoning`.

What it costs. The stages DeepSeek wrote get about twice as expensive per call: a Starting Level set was $0.009 on DeepSeek and is $0.019 on Sol, a Blueprint about $0.011 against about $0.025, validity and goal focus a cent or two together. That is 3 to 5 cents more per Course, against the 33 to 38 cents the discarded set cost. Speed is a wash on the 2026-11-01 records: a Sol set took 27 to 36 s, DeepSeek's on Alibaba 28 to 36 s, so the 35-second advantage measured in October no longer shows. Terra has not been measured as a writer here; it is the fallback, reached only after two bad Sol replies or a failed set, and the `rounds` and `authorModelIds` on each step will show how often that happens.

Rejected:
- **Keep DeepSeek as the cheap fallback.** A fallback writes a whole new set or draft after the primary's checks failed, which is exactly where reliability matters most, and DeepSeek's output failed those same checks 4 times in 5.
- **Terra first, Sol as fallback.** Half the price, but no pass-rate record as a writer; Sol has one.
- **A cross-vendor Judge fallback.** The team's standing preference is against Anthropic models as default Judges (publish-gate Judge research), and ADR 0015's bar is a different model ID, not a different vendor.
- **`gpt-6-sol` as the Judge fallback.** A different ID from the author, so ADR 0015 allows it, but it is the author's own family at twenty times Luna's price; a Luna-family fallback keeps the Judge cheap and plainly not a writer.
