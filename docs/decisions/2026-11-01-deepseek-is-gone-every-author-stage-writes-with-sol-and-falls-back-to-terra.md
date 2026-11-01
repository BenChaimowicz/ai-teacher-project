---
date: 2026-11-01
tickets: SEN-122, SEN-120
people: Yarden
status: active
---

# DeepSeek is gone: every author stage writes with Sol and falls back to Terra, and the Judge falls back to the previous Luna

**Why:** Ben proposed it on SEN-122 and Yarden confirmed it in chat on 2026-11-01. SEN-119 measured what DeepSeek was costing us on the Starting Level check: its item set failed all three review rounds in 4 of the last 5 diagnostics, Sol then wrote a fresh set, and the discarded set's author calls plus its You.com fact-checks came to $0.33 to $0.38 per Course, paid for questions no Learner ever saw. ADR 0018 had already moved Lessons to Sol after DeepSeek passed none of its 11 first drafts. DeepSeek also returned invalid structured output on 4 of 139 calls in the last 30 days, against 0 for Sol and Luna.

The pins, verified on OpenRouter the same day: `openai/gpt-6.1-sol` first and `openai/gpt-6.1-terra` as fallback for every author stage; the Judge stays `openai/gpt-6-luna` and falls back to `openai/gpt-5.6-luna` instead of Sol, so a Judge is never one of the writers and Sol-written Lessons keep a working Judge fallback. The Alibaba host pin that existed only for DeepSeek goes too. ADR 0028 has the detail and supersedes ADR 0018.

We turned down keeping DeepSeek as the cheap fallback: a fallback writes a whole new draft after the primary's checks failed, which is where reliability matters most, and DeepSeek failed those same checks 4 times in 5.

**What it costs:** the stages DeepSeek wrote cost about twice as much per call on Sol, about 3 to 5 cents more per Course, against the 33 to 38 cents the discarded set was costing. The 35-second speed advantage measured for DeepSeek on Alibaba in October no longer shows in the 2026-11-01 records, where both took 27 to 36 s per set. Terra is untested as a writer; it is reached only after two bad Sol replies or a failed set, and each step records which models wrote it.
