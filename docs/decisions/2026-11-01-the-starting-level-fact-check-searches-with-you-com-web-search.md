---
date: 2026-11-01
tickets: SEN-120, SEN-119
people: Yarden
status: active
---

# The Starting Level fact-check searches with You.com Web Search, not the Research API

**Why:** The fact-check confirms a keyed answer by handing the Judge the snippets a search returns; it never used the Research API's written answer, only its sources' snippets, at $0.05 a call. SEN-119 found the fact-check was the largest single line of a Course ($0.65 to $0.75 on 2026-11-01), that the Judge flags two items in three for it, and that in 68 checks it overturned a key twice, both for missing evidence. On 2026-11-01 `check:fact-check-vendors:live` ran the real fact-check over the 14 keyed answers the Judge had flagged on the Gram and Norse test Courses with four searches: You.com Web Search with snippets ($0.005), Web Search with highlights (about $0.015), Research lite ($0.012) and Research standard ($0.05, the stored verdicts from the real run). All four confirmed all 14, and every verdict agreed with the stored one. The Web Search call took a few seconds against ten to thirty for a Research call.

Web Search with snippets is now the fact-check's default search (`you-search`); the fact-checker still takes any research adapter, so the others remain one option away. Yarden chose it over the highlights variant (three times cheaper than today, a little more text per page) and over keeping Research standard.

**What it costs:** thinner evidence per key. A Research call picks its sources on purpose; a web search returns what matches the words, and on one of the 14 claims it found a single supporting page where the others found five. On a rarer fact the Judge may see nothing that bears on the key and call it unconfirmed, which sends the item through a rewrite round and another check: time, not a wrong key. On a knowledge-goal Course the check falls from about $0.30 to about $0.03 per set. The re-run of the test Courses under SEN-120 shows whether the rewrite rounds grew.
