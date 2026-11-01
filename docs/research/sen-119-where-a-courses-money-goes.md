# Where a Course's money goes (SEN-119)

**Date:** 2026-11-01. **Data:** `usage_records`, `pipeline_events`, `starting_level_diagnostics` and `vendor_balance_snapshots` in the shared Supabase database, read at about 15:00 UTC. The two 2026-11-01 Courses ran on main `2e267d4`; the generation code has not changed since. Spend is from Request to publish, so it includes the Starting Level check. Where this note says "measured" it means a vendor balance moved; everything else is what the vendor reported (`actual`) or our list price (`estimated`).

## Answers in short

- A 3-Reading, 3-Quiz Course costs **$0.84 to $1.83** today. The spread is almost entirely the Starting Level check: $0 when the Learner says they are brand new, $0.27 when one item set passes (one Course so far), $0.35 to $0.82 when the first set is thrown away and a second one written.
- **The research list prices are right.** Every You.com call, fact-check or research, moved the balance by exactly $0.05: 79 calls recorded inside the snapshot window since 2026-10-24, $3.95 at list, and the balance fell $4.00, the extra $0.05 being one unrecorded call. Every window we can bound matches. Parallel billed $0.10 per `pro` run on the one day it was readable, including a run that returned no sources.
- The per-call `measured_cost_usd` is **not usable**: 2 of 88 You.com calls got a number and both were wrong by 3 to 6 times, because charges from concurrent calls land inside the window. Parallel measured 0 of 39. Reconcile balance steps against recorded calls per window instead.
- The fact-check makes **one You.com call per item the Judge passes and flags as an external factual claim, per rewrite round**. The Judge flags 66% of items. A set that passes needs 0 to 8 calls: 0 on the two skill goals (drawing, drumming), 5 to 8 on knowledge goals. The 13 to 15 on 2026-11-01 happened because DeepSeek's set failed all three rounds and Sol wrote a new one: 7 of the 15 (Gram) and 7 of the 13 (Norse) calls checked items that were thrown away.
- The "fallbacks" are not ADR 0015 retries. They are spec §4.3's second set by the fallback Generator. DeepSeek's sets failed on deterministic item-writing checks it keeps re-offending on, and on keys the Judge disagreed with. One real retry happened (a schema-invalid DeepSeek reply, $0.006).
- Per Lesson: a Reading with its Quiz costs **about $0.30** ($0.15 research, $0.08 writing and judging the Reading, $0.07 the Quiz). A 6-Reading Course with Quizzes would be about $1.80 plus the fixed part.
- The Usage Console can show the cost per step for one Request, but not that a diagnostic ran two sets, not spend on artifacts that were discarded, not cost per Lesson slot, and its billing check mis-reads the You.com account switch of 2026-11-01 as $76 of spend.

## 1. What a Course costs, by stage

Five Courses published since Readings moved to Sol (ADR 0018). All have 3 Readings and 3 Quizzes. USD, rounded to the cent where it matters; `estimated` rows are list prices.

| Stage | Investing (10-26) | Draw a cat (10-26) | Sheet music (10-29) | Gram (11-01) | Norse (11-01) |
| -- | -- | -- | -- | -- | -- |
| Request checks: validity, goal focus (DeepSeek) | 0.005 | 0.003 | 0.005 | 0.009 | 0.008 |
| Starting Level items: author + Judge | 0.021 | 0.049 | — | 0.072 | 0.071 |
| Fact-check: You.com calls (count) | 0.25 (5) | 0.30 (6) | — | 0.75 (15) | 0.65 (13) |
| Fact-check: Judge reads | 0.001 | 0.001 | — | 0.002 | 0.002 |
| Blueprint: author + Judge | 0.030 | 0.011 | 0.011 | 0.034 | 0.024 |
| Reuse fit calls | — | — | — | — | 0.014 |
| Research: Parallel Pro, 3 × $0.10 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 |
| Research: You.com, 3 × $0.05 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 |
| Readings: Sol drafts and repairs | 0.236 | 0.125 | 0.135 | 0.277 | 0.353 |
| Readings: Luna vetting, review, media checks | 0.009 | 0.006 | 0.009 | 0.018 | 0.020 |
| Quizzes: Sol | 0.232 | 0.218 | 0.227 | 0.211 | 0.205 |
| Quizzes: Luna | 0.002 | 0.002 | 0.003 | 0.003 | 0.003 |
| Whole-Course Judge | 0.000 | 0.000 | 0.001 | 0.001 | 0.001 |
| **Total** | **1.24** | **1.17** | **0.84** | **1.83** | **1.80** |
| Calls | 43 | 48 | 33 | 85 | 78 |
| Request created → published | 27 min | 27 min | 16 min | 22 min | 37 min |

Notes on the rows:

- Sheet music skipped the Starting Level check: the Learner chose **Brand new to this** (ADR 0021). Real newcomers will do the same, so the check only costs for Learners who claim some knowledge.
- Investing's DeepSeek set passed in two rounds (5 fact-checks). Draw a cat, Gram and Norse all threw DeepSeek's set away and had Sol write another. Draw a cat's Sol set then needed no fact-check at all: the Judge called none of its keys an external factual claim.
- Gram's four images cost under $0.01 in vision checks. Media is not a cost line.
- Every Judge call in a Course, 19 to 44 of them, adds up to $0.02 to $0.03. Luna is cheap and is not a target.
- The two Courses before ADR 0018 (Pacific Ocean 10-25, $1.87; Norse 10-25, $2.96) spent $0.91 and $1.24 on Reading drafts alone, with 20 to 23 author calls each. They are history, not a baseline.

Implied token prices, from the recorded cost and tokens of successful calls (derived, not the vendors' list): Sol about $2.50 in / $10 out per million, Luna about $0.10 / $0.50, DeepSeek on Alibaba about $0.40 / $3.40.

## 2. Are the research list prices right?

### You.com: yes, $0.05 per call, every call

The console snapshots the You.com balance every 15 minutes while it runs. Each step the balance took matches the calls recorded in that window at $0.05, with no exception:

| Window (UTC) | Balance step | Recorded You.com calls | × $0.05 |
| -- | -- | -- | -- |
| 10-24 14:51 → 10-25 | −0.90 | 18 (the 9 earlier fact-checks were before the first snapshot) | 0.90 |
| 10-26 | −0.85 | 17 | 0.85 |
| 10-27 | −0.20 | 4 | 0.20 |
| 10-29 | −0.15 | 3 | 0.15 |
| 11-01 11:00 → 11:09 | 9.95 → 9.80 | 3 (Drum kit fact-check) | 0.15 |
| 11-01 11:15 → 11:24 | 9.80 → 8.40 | 28 (Gram 15 + Norse 13 fact-checks) | 1.40 |
| 11-01 11:24 → 11:31 | 8.40 → 8.25 | 3 (Gram research) | 0.15 |
| 11-01 11:39 → 11:47 | 8.25 → 8.10 | 3 (Norse research) | 0.15 |

Two things the snapshots also show. At 09:26 UTC on 2026-11-01 the key started answering as a **different You.com account** (`data.id` changed) with a $10.00 balance, where the old one held $86.25: the founders moved Knibbler to a You.com business account that morning (Yarden, 2026-11-01). The console's billing check reads the switch as $78.15 billed on 2026-11-01. And between 10:12 and 10:19 UTC the new account lost $0.05 with no Usage Record anywhere: one call from the same unrecorded stack, or a test of the new key.

### Parallel: $0.10 per `pro` run, on the one day we could read it

The Parallel Account API login expired on 2026-10-26 and was renewed only briefly on 2026-10-31 (`pnpm parallel:login`); 724 of 1,116 Parallel readings are errors. On 2026-10-26, the one full readable day, funds dropped $0.60 for 6 recorded runs: 5 that answered and 1 that returned no sources, all billed. On 2026-10-31, readable for 34 snapshots, funds dropped $0.60 with **no Usage Record for any Parallel run**: six `pro` runs from Ben's stack, which was not recording to the shared database that day (confirmed by Yarden, 2026-11-01). Spend from a stack pointed at a local database is invisible to the console.

### The per-call measurement does not work

`measured_cost_usd` is set only when exactly one call to the vendor was open in the process. The fact-check fires its calls with `Promise.all`, and the two test Courses ran at once, so 75 of 88 You.com calls were flagged as overlapped. The two that were not got $0.15 and $0.30 for a $0.05 call: You.com charges a few seconds late, so the window caught other calls' charges. Parallel never measured a call (15 had no login token, 6 overlapped, 18 were backfilled). Per-window reconciliation, as in the table above, is the method that works; the per-call one should go.

## 3. The fact-check: how many calls, and why

Mechanics (`diagnostic.ts`, `fact-check.ts`): each round, items that pass the code checks go to the Judge. For every item the Judge passes **and** flags `externalFactualClaim`, one You.com Research call (standard effort, $0.05) fetches pages and one Luna call reads them ($0.0001). Rewritten items are new items, so they are checked again next round. Items that already passed are not re-checked. So the count per set is the sum over rounds of flagged passing items.

What the counts were, by set and round:

| Course | DeepSeek set, rounds 1/2/3 | Sol set, rounds 1/2/3 | Total |
| -- | -- | -- | -- |
| Gram (11-01) | 6 / 0 / 1, then failed | 4 / 3 / 1 | 15 |
| Norse (11-01) | 5 / 2 / 0, then failed | 4 / 1 / 1 | 13 |
| Drum kit (11-01, at Blueprint review) | 3 / 0 / 0, then failed | 0 | 3 |
| Draw a cat (10-26) | 4 / 0 / 2, then failed | 0 | 6 |
| Investing (10-26) | 2 / 3, passed | — | 5 |

Across the 119 Judge reviews stored for sets since 2026-10-24, the Judge flagged 79 items (66%) as external factual claims; 68 were fact-checked and **2 came back unconfirmed**. The reasons stored for unconfirmed keys, here and in older attempts, are mostly retrieval gaps ("the excerpts do not state that it is in Asgard", "they do not establish that this allocation…"), not wrong keys. Wrong keys are caught by the Judge answering blind: every fact-checked item had already been answered by Luna, without the key, with the same answer, because that is the condition for reaching the fact-check at all.

So: a set that passes needs 0 to 8 calls ($0 to $0.40; 5 to 8 on knowledge goals), and today's 13 to 15 are two sets. The fact-check is a third opinion that overturns about 3% of the keys it sees, usually for lack of evidence rather than contradiction.

## 4. Why the diagnostic "falls back"

The `fallback_generator` calls are not ADR 0015's retry-then-fallback. When a set still has failing items after two rewrite rounds, `build` throws `DiagnosticFailedError` and spec §4.3 says to write a **whole new set** with the fallback Generator. That is Sol's set, its 1 to 2 rewrites, its Judge rounds and its fact-checks. One true ADR 0015 retry also happened: Gram's DeepSeek set reply failed the schema once and was retried on DeepSeek ($0.006, 20 s).

Why DeepSeek's sets fail, from the problems sent back in its rewrite requests (the discarded set's reviews are not stored anywhere else):

- **Gram:** item 2 failed the deterministic checks in all three rounds ("the key repeats a distinctive stem word the distractors lack", "the key must not stand out as the longest option"); the rewrite re-offended each time. Item 6 went stem-word repeat → overlaps another item → key unconfirmed.
- **Norse:** items 1 and 7 duplicated each other, item 8 had implausible distractors; then item 7's key disagreed with the Judge's blind answer, twice.
- **Drum kit:** five items flawed in round 1, three in round 2, two of them "no defensible answer" on a notation pattern.

Sol's sets are not clean either: Gram's needed two rewrite rounds (four items, mostly implausible distractors, then one), Norse's needed two (four items, then two). But they pass inside the budget. This is SEN-122's case, measured: a discarded DeepSeek set costs about $0.03 of author calls, under $0.01 of Judge calls and **$0.30 to $0.35 of fact-checks**, plus about 2.5 minutes, and it happened in 4 of the last 5 diagnostics that ran DeepSeek first (draw a cat, drum kit, Gram, Norse; investing passed).

## 5. Cost per Lesson, and 4 to 6 Lesson Courses

From the five Courses above (15 Readings, 15 Quizzes):

| Unit | Mean | Range | What it is |
| -- | -- | -- | -- |
| Research per Reading | $0.15 | fixed | one Parallel Pro run + one You.com call, list price, verified |
| Reading, write + judge | $0.079 | $0.037 to $0.225 | Sol draft at ~15k prompt tokens ($0.065); a repair is ~13k prompt tokens ($0.046); 13 of 15 passed first draft |
| Quiz, write + judge | $0.074 | $0.055 to $0.090 | Sol at high reasoning effort, ~3.9k reasoning tokens of 5.9k output; 14 of 15 passed first draft |
| **Reading with its Quiz** | **$0.30** | | |

Fixed per Course: request checks and Blueprint $0.02 to $0.04, reuse fit $0.014 when candidates exist, whole-Course Judge under $0.001, and the Starting Level check at $0 (brand new), $0.27 (one set, observed once) or $0.35 to $0.82 (two sets).

Projection, one Quiz per Reading as every Course so far has had (the Blueprint's Quiz cadence can be sparser; a Quiz per two Readings makes a Reading about $0.27):

| Readings (+ Quizzes) | Lessons + fixed, Starting Level skipped | with one item set | with two sets (today) |
| -- | -- | -- | -- |
| 3 | $0.93 | $1.25 | $1.70 |
| 4 | $1.23 | $1.55 | $2.00 |
| 5 | $1.53 | $1.85 | $2.30 |
| 6 | $1.83 | $2.15 | $2.60 |

The observed Courses sit on this line ($0.84 skipped, $1.17 to $1.24 one set, $1.80 to $1.83 two sets). One caveat for longer Courses: each Reading is written with the earlier Readings carried forward, so prompt tokens, already the larger half of a draft's cost, grow with position. Prompt caching covered only 7% of Sol's prompt tokens in Gram.

## 6. Savings candidates, ranked (for SEN-120)

Per 3-Reading, 3-Quiz Course against the 2026-11-01 baseline of $1.80 to $1.83. "Confidence" is how sure the saving is, not how sure the decision is.

1. **Stop paying for a discarded item set** (SEN-122: Sol first for the Starting Level check). Saves $0.33 to $0.38 and about 2.5 minutes in every diagnostic where DeepSeek's set fails, which was 4 of the last 5. No quality trade-off: the set was thrown away anyway. Confidence: high, measured.
2. **Fact-check fewer keys, or cheaper.** 66% of items are flagged; 3% of checks overturn a key, mostly for missing evidence. Options, in rising quality risk: one You.com call per round covering every flagged claim instead of one per claim (saves $0.15 to $0.30 on a knowledge-goal set); a narrower flag (dates, attributions, named protocols only); or trust the Judge's blind answer and drop the web check ($0.25 to $0.40). Needs a decision-log entry under SEN-120's rule, since it lowers grounding. Confidence in the dollar figure: high; in the quality cost: unmeasured.
3. **Parallel Pro on every Reading** is $0.30 of the $0.45 research and 2.5 to 3.5 minutes per Reading. A cheaper Parallel processor, or a cheaper second engine with You.com as primary, could save $0.15 to $0.30. Spec §5.3 wants two engines, and Parallel's packs (5 to 19 Sources) were not visibly richer than You.com's (6 to 19) in these runs. Verify the processor prices on Parallel's pricing page first; this note could not. Confidence: medium.
4. **Quiz reasoning effort.** The Quiz author runs at `high` "as for the reading" (ADR 0010 measured Readings, not Quizzes). About $0.04 of each $0.07 Quiz is hidden reasoning. A cap or `medium`, measured against the first-draft pass rate (14 of 15 today), could save $0.06 to $0.10. Confidence: medium; needs a measured run.
5. **Reading prompt size and caching.** A draft carries ~15k prompt tokens; a repair ~13k and costs 70% of a draft. Stable prompt prefixes for caching and trimming carried-forward Readings might save $0.02 to $0.05, more on 6-Reading Courses. Low priority until Courses grow.
6. **Not worth chasing:** Judges ($0.03 a Course), Blueprint ($0.02), validity and focus ($0.01), media checks (under $0.01).

Housekeeping that is not a saving but blocks measuring one: keep the Parallel login fresh (`pnpm parallel:login`, console running) so Parallel is readable during the SEN-120 before-and-after runs; and tell the console about the You.com business account (its starting balance is still hard-coded as $100 for the old account, and the new one started at $10.00).

## 7. What the Usage Console is missing

Everything above needed SQL. What the console would need to answer the same questions:

- **Two sets in one diagnostic.** The diagnostic Pipeline Event says `authorModelId: openai/gpt-6.1-sol, rounds: 3` for Gram, though 13 model calls and two authors happened; the discarded set's reviews are kept nowhere. Record each set as its own child step with its author and outcome.
- **Spend on discarded artifacts.** Failures shows wasted spend only for failed calls. The $0.40 of a thrown-away item set, and the Reading drafts that lost to a repair, are successful calls on artifacts that never shipped. A "spent on artifacts that were discarded" figure per Course needs the step to say what it kept.
- **Cost per Lesson slot.** Research, reuse, Reading and Quiz steps carry `slotId`; group them so a Course shows cost per Reading and per Quiz, and the Course list shows cost per published Lesson.
- **Cost by call type.** Steps and models are there, but not `schemaName`: that quiz reasoning is $0.04 a Quiz, or that a Reading repair costs 70% of a draft, needs the request payload.
- **Window reconciliation instead of per-call measurement.** Show balance steps against recorded list prices per Pipeline Event or per day, and retire `measured_cost_usd` for research calls.
- **Account changes and starting balances.** Detect a changed account id in the You.com reading and start a new series instead of booking a $76 charge, as the move to the business account did; make starting balances an Operator setting, not `OPERATOR_STARTING_BALANCES` in code.
- **Compare two Courses.** SEN-120 wants before-and-after per stage; a side-by-side of two Course Requests would make section 1 of this note a screen.

## 8. After SEN-122 and SEN-120: the re-run of 2026-11-01

Both test Courses were run again through the product between 17:06 and 17:51 UTC with `pnpm run:test-courses:live`, as the test Learner, on main `9fcdb76`: Sol writes every stage with Terra behind it (ADR 0028), the fact-check searches with You.com Web Search, the Quiz author reasons at medium, and a rate-limited call is retried once. Both published and passed every Judge. Their Blueprints came out as **4 Readings and 2 Quizzes** for this Learner's Teaching Profile, against 3 and 3 in the morning, so the per-unit lines below are the fair comparison, not the totals.

| Stage | Gram, morning (3R+3Q) | Gram, re-run (4R+2Q) | Norse, morning (3R+3Q) | Norse, re-run (4R+2Q) |
| -- | -- | -- | -- | -- |
| Request checks | 0.009 | 0.004 | 0.008 | 0.008 |
| Starting Level items: author + Judge | 0.072 (two sets) | 0.040 (one set) | 0.071 (two sets) | 0.072 (one set, plus 0.041 on two sets lost to a missing key in `.env`) |
| Fact-check searches (count) | 0.75 (15) | 0.040 (8) | 0.65 (13) | 0.030 (6) |
| Fact-check Judge | 0.002 | 0.002 | 0.002 | 0.001 |
| Blueprint: author + Judge | 0.034 | 0.026 | 0.024 | 0.030 |
| Reuse fit | — | — | 0.014 | 0.007 |
| Research | 0.45 | 0.60 | 0.45 | 0.40 recorded; two Parallel runs lost at our end (SEN-126), about 0.60 billed |
| Readings: author + Judge | 0.295 | 0.436 | 0.373 | 0.422 |
| Quizzes: author + Judge | 0.214 | 0.112 | 0.208 | 0.133 |
| Whole-Course Judge | 0.001 | 0.001 | 0.001 | 0.000 |
| **Total** | **1.83** | **1.26** | **1.80** | **1.10** (about 1.26 with the lost runs billed, 1.22 of it product cost) |
| Calls | 85 | 69 | 78 | 62 |
| Starting Level check prepared in | 4.6 min | 1.7 min | 4.8 min | 1.4 min |
| Blueprint designed in | 2.0 min | 0.7 min | 1.4 min | 0.7 min |
| Generation, approve to publish | 12.8 min | 13.1 min | 14.0 min | 15.8 min, with two 5-min Parallel stalls |

Per unit on the re-run: research $0.15 a Reading at list; a Reading's writing and judging $0.106 (Norse) and $0.109 (Gram), with drafts at about 23k prompt tokens and $0.08 to $0.10 each, one Gram Reading taking three rounds; a Quiz $0.067 (Norse) and $0.056 (Gram); the Starting Level check, one Sol set with its searches, $0.06 to $0.07. On these unit prices a 3-Reading, 3-Quiz Course is **about $1.07, against $1.80 to $1.83 in the morning**, and a Reading with its Quiz is about $0.32.

Where it came from, and what did not move:

- **The fact-check**, $0.65 to $0.75 in the morning, is $0.03 to $0.04: one set instead of two, and $0.005 a search instead of $0.05. Every key the Judge flagged was confirmed on the first search.
- **One item set instead of two** also took the Starting Level check from 4.6 and 4.8 minutes to 1.7 and 1.4.
- **The Quiz author at medium** cut hidden reasoning from 3.1k to 6.2k tokens per Quiz to 0.2k to 0.4k, but these Quizzes assess two Readings each and their visible output doubled, so a Quiz cost $0.051 to $0.065 against $0.054 to $0.089: about 15% less, all four passing their first draft. The $0.035 of the one-Reading Quiz in the live check does not carry over to two-Reading Quizzes.
- **Readings and research did not change** per Reading, as decided (Parallel stays on `pro`).
- **Sol instead of DeepSeek** on the small stages: validity, focus and the Blueprint together cost $0.03 to $0.04 either way, and the Blueprint designed in 0.7 minutes instead of 1.4 to 2.0.

Two things the re-run turned up: two of Norse's four Parallel Pro runs failed after exactly 304 s, because Node's fetch gives up waiting for headers at 300 s while the adapter blocks on Parallel's result for up to ten minutes (SEN-126; those runs are billed by Parallel and recorded at $0 here), and the worker runs one job at a time, so Gram's Blueprint waited 16 minutes for Norse's generation, as it did in the morning. The run records are `docs/research/sen-120-test-course-run-norse.json` and `-gram.json`.

## Appendix: the queries

Step kinds nest (fact-check under diagnostic, research and Readings under course generation), and a child step may carry no Course Request id, so every query walks the tree:

```sql
with recursive tree as (
  select id, course_request_id, kind from pipeline_events where parent_id is null
  union all
  select e.id, coalesce(t.course_request_id, e.course_request_id), e.kind
  from pipeline_events e join tree t on e.parent_id = t.id
)
select t.course_request_id, t.kind, u.vendor, u.model_id, u.role, u.outcome, u.cost_basis,
  count(*) as calls, sum(u.cost_usd) as usd,
  sum(u.prompt_tokens) as prompt_tokens, sum(u.completion_tokens) as completion_tokens, sum(u.reasoning_tokens) as reasoning_tokens
from usage_records u join tree t on t.id = u.pipeline_event_id
where t.course_request_id = '<request id>'
group by 1, 2, 3, 4, 5, 6, 7 order by 2, 9 desc;
```

Balance steps for a vendor, to set against the calls recorded between two steps:

```sql
select vendor, balance_usd + coalesce(pending_usd, 0) as funds, min(taken_at), max(taken_at), count(*)
from vendor_balance_snapshots
where vendor = 'you' and error is null and taken_at between '<from>' and '<to>'
group by 1, 2 order by 3;
```

The problems that sank a discarded item set live in the rewrite requests, under `request -> 'input' -> 'rewrite'`, on the Usage Records of the diagnostic step whose `schemaName` is `starting_level_diagnostic_rewrites`.
