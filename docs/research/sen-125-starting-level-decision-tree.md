# Starting Level check as a decision tree built from one upfront search (SEN-125)

**Date:** 2026-11-04. **Data:** `pipeline_events`, `usage_records` and `starting_level_diagnostics` in the shared Supabase database, read on 2026-11-03 at about 22:00 UTC, plus the SEN-119 note and its §8 re-run. "Today" means the Sol era: every check prepared after 2026-11-01 17:00 UTC on main `9fcdb76` or later, when Sol became the author (ADR 0028) and the fact-check moved to You.com Web Search (decision 2026-11-01). That is six checks, all on the two test goals (Norse cosmos, Gram staining), prepared by the test-Course driver and by us. There is no real Learner in the data yet.

## Answers in short

- **The idea was priced against numbers that have since moved.** The ticket's 13 to 15 searches and 2.5 to 5 minutes were the DeepSeek-then-Sol two-set days. A Sol-era check makes 6 to 8 searches at $0.005 each, costs **$0.06 to $0.09** all in, and is ready in **84 to 138 s** when Sol's set passes. The searches are now $0.03 to $0.04 of a $1.07 Course and 10 to 20% of the check's wait. What the Learner waits on is the model calls: a 38 s author call, a 19 s Judge read, a 31 s rewrite, a second Judge read. Every Sol set so far has needed at least one rewrite round, and that round is where the time goes.
- **One upfront pack does not buy anything the per-claim search still costs.** The pack ($0.05 for a Research call, $0.012 lite) costs about what the 6 to 8 searches it replaces cost ($0.03 to $0.04) once its excerpts sit in every author and Judge prompt, it runs serially before the author can start (10 to 30 s) instead of in parallel after the Judge (4 to 17 s a round), and it would not shorten the rewrite rounds, which are about distractor craft, not keys. It would also hand the author and the Judge the same evidence, collapsing two independent opinions on each key into one. Keys are not the problem today: in the Sol era the Judge's blind answer disagreed with the key 0 times in 53 and the fact-check confirmed 34 of 34.
- **A tree that decides which question comes next changes the §4.3 contract.** The Blueprint consumes a map of eight capabilities, each evidenced or not. A tree's output is a path, and a path encodes a position; the capabilities a Learner is not asked are either inferred from a hierarchy, which §4.3 and the assessment-design note forbid, or put in the gap unprobed, which is what asking fewer questions was meant to avoid. The one tree §4.3 allows prunes only toward the floor (stop asking once the floor is certain) and saves a few clicks for the Learner who already clicks I don't know in under five seconds each.
- **The Course's own research cannot double as the check's evidence.** Research runs per Reading slot, after the Blueprint is approved, and only for Lessons in the remaining gap. The check runs before the Blueprint exists and must probe the capabilities the Course will *not* teach. The order cannot be swapped: the Blueprint is designed for the remaining gap the check produces.
- **Authoring 15 to 20 items doubles the author's output, the Judge's reading and the fact-check, and lengthens the wait past the limit.** Estimated $0.14 to $0.18 a check and 230 to 330 s typical, 450 s or more when the fallback author is needed. Railway closes a silent request at 5 minutes (SEN-106). Today's check already touches that limit in its tail (2 of 6 Sol-era checks ran 294 and 301 s); a tree would put the median there.
- **Recommendation: do not build the tree or the upfront pack.** Meet the launch requirement by taking the preparation off the request clock, which the lease (ADR 0023) and the browser's 3-second poll already make cheap, and then shorten the tail by letting the fallback author rewrite the failing items rather than a whole new set, and by teaching the author the Judge's one recurring flaw. Each is measurable with `pnpm check:starting-level:live`. Details in §6.

## 1. Where a check's time and money go today

Model and vendor calls inside `Item set` steps since 2026-11-01 17:00 UTC, averaged over the calls recorded (prices are OpenRouter's reported cost; searches are list price):

| Call | Model | Calls | Avg time | Max | Avg cost | Tokens in / out / reasoning |
| -- | -- | -- | -- | -- | -- | -- |
| Author: eight capabilities and items | Sol | 8 | 38 s | 46 s | $0.020 | 672 / 1,861 / 657 |
| Author: eight items (fallback) | Terra | 2 | 26 s | 28 s | $0.009 | 672 / 1,667 / 590 |
| Judge: blind review of pending items | Luna | 21 | 19 s | 40 s | $0.001 | 908 / 1,777 / 1,573 |
| Rewrite: failing items | Sol | 8 | 31 s | 48 s | $0.015 | 888 / 1,261 / 709 |
| Rewrite: failing items (fallback) | Terra | 3 | 17 s | 23 s | $0.006 | 871 / 1,084 / 702 |
| Fact-check: one search per flagged key | You.com Web Search | 54 | 1.1 s | 1.5 s | $0.005 | |
| Fact-check: Judge reads the snippets | Luna | 54 | 3.2 s | 10 s | $0.0002 | 1,505 / 77 / 32 |
| Gap statement, after the answers | Sol | 5 | 3 s | 4 s | $0.002 | 553 / 92 / 0 |

The calls run in series except the fact-check, whose searches and reads run together, so a fact-check round takes 4 to 17 s. A set that passes in two rounds is author → Judge → fact-check → rewrite → Judge → fact-check, about 38 + 19 + 5 + 31 + 15 + 8 = 116 s. The six Sol-era checks:

| Check | Rounds | Prepared in | Model calls | Searches | Cost |
| -- | -- | -- | -- | -- | -- |
| Norse, 11-01 17:18 | 2 | 84 s | 4 | 6 | $0.06 |
| Gram, 11-01 17:19 | 2 | 100 s | 4 | 8 | $0.08 |
| Norse, 11-02 10:28 | 3 + 3 | **301 s, failed on both authors**; Retry diagnostic then passed in 113 s | 12 + 4 | 11 + 6 | $0.13 + $0.07 |
| Gram, 11-02 10:53 | 2 | 138 s | 4 | 7 | $0.08 |
| Gram, 11-02 11:59 | 3, then Terra's set in 2 | **294 s** | 10 | 16 | $0.15 |

So a check is $0.06 to $0.09 and 84 to 138 s when Sol's set passes, which it did in 4 of 6. The tail is the whole-set fallback (spec §4.3, ADR 0015): Sol's set spends 198 s failing three rounds on one or two stubborn items, then Terra writes eight new items and reviews them for another 96 s. Both tails were this, and both ran right at Railway's 5-minute line. The 21-day figures Ben quoted on the ticket (median 79 s, p95 301 s, max 314 s) and the 30-day ones here (median 139 s, p95 304 s) include the DeepSeek two-set days, but the tail has the same shape in the Sol era.

Why every set needs a rewrite round. Across the 57 item reviews stored for Sol-era sets, 40 items were reviewed in round 0 and 23 passed (57%). The 17 failures: 4 on the deterministic checks (all "the key repeats a distinctive stem word the distractors lack") and 13 on the Judge's flaws, 12 of them one flaw in different words: **implausible distractors** ("obviously inadequate aseptic technique", "millimeters and centimeters are implausible for a bacterial cell", "readily ruled out as works from other traditions"). The Judge found exactly one defensible option on all 53 items it reviewed and never disagreed with the key. It flagged 45 of 53 as resting on an external factual claim, and the fact-check confirmed all 34 that reached it. The keys are right; the distractors are weak.

## 2. What a tree can and cannot be under spec §4.3

§4.3 fixes what the Blueprint receives: eight prerequisite capabilities spanning novice to near-goal, each probed by one item, each **evidenced** (answered correctly) or **not evidenced** (incorrect, I don't know, skipped), a remaining-gap statement, a coverage note and an Extremity of floor, mixed or ceiling counted from the evidenced list. The Blueprint prompt (`blueprint.ts`) turns that into `inPlace` and `remainingGap` lists and is told not to teach `inPlace`. Two rules in §4.3 and the assessment-design note (§3.3, §5.3) decide what a tree may do:

- **Only a correct item evidences a capability.** ADR 0021 restates it: self-report never makes a capability evidenced. So a capability a Learner is never asked about can never be in place.
- **Do not assume a validated hierarchy.** A near-goal item right and a fundamental wrong is a mixed profile that keeps the missed fundamental. Computerised adaptive testing and knowledge-space recovery were rejected because our items are uncalibrated and the hierarchy is the author's guess.

A decision tree in the ticket's sense, where an answer decides which question comes next, is a search over that guessed hierarchy: answer the span-4 item right and go up, wrong and go down. After four or five answers it has a position. That is the "band" §4.3 says Starting Level is not, and it leaves three or four capabilities unprobed. They cannot be marked in place (rule one), so they go in the remaining gap, and the Learner gets a longer Course than eight questions would have given them. The only direction a tree may prune is toward the floor: once a Learner has missed the fundamentals, the rest may be left unasked and recorded as skipped, which is already a valid `EvidenceStatus` and already counts as floor. That is a weaker cousin of ADR 0021's Brand new to this, triggered by answers instead of the Learner's word, and it is worth little: the Learners who reach the floor by answering click I don't know eight times in 4 to 32 s, all but one (18 answered attempts in 30 days: 13 floor, 5 mixed, 0 ceiling; the mixed ones, answered by us for real, took 126 to 274 s). Too easy also assumes a complete map; it moves the lowest-span evidenced capabilities into the gap, which has no meaning for capabilities that were never asked.

A tree does nothing to the preparation. Every item a Learner might see has to be authored, code-checked, judged and fact-checked before the first question, so the Judge's cost and the wait scale with the items written, not the items seen. The Judge's independence (ADR 0015) and the deterministic checks apply unchanged, to twice as many items.

## 3. One upfront pack as the evidence

What it would replace: the fact-check's one search per flagged key, now $0.005 and about one second, 6 to 8 of them a set, run in parallel after each Judge read.

What it would cost. A You.com Research call on the focused goal is $0.05 at standard effort and $0.012 at lite, taking 7 to 30 s in recorded runs (Parallel is 2 to 4 minutes, out of the question up front). A standard You.com Research pack in recorded runs is 5 to 6 Sources and about 22,000 characters of excerpts (a Parallel Pro pack runs to 13 Sources and 76,000), which is 5,500 to 19,000 prompt tokens on every author, rewrite and Judge call: about $0.01 to $0.04 more per author call at Sol's $2 per million in, and more time per call. A lite pack cuts the search line by $0.02 and the author line rises by about as much. Against today:

| Per check | Today, Sol era | Upfront pack, eight items | Upfront pack, 16 to 20 items (tree) |
| -- | -- | -- | -- |
| Search | $0.03 to $0.04 | $0.05 standard, $0.012 lite | same |
| Author and rewrites | $0.035 | $0.05 to $0.07 | $0.10 to $0.13 |
| Judge | $0.003 | $0.004 | $0.008 |
| **Total** | **$0.06 to $0.09** | **$0.10 to $0.13** ($0.07 to $0.10 lite) | **$0.14 to $0.18** |
| Ready, when the first set passes | 84 to 138 s | about the same: +10 to 30 s pack before the author, −10 to 20 s of searches after | 230 to 330 s |
| Tail: fallback author's set | 294 to 301 s | 300 to 330 s | 450 s or more |

Would a pack ground the keys as well? It cannot do better than today's 34 of 34, and it would do worse on reach. A pack answers one query about the goal; the keys are eight specific claims from novice to near-goal, inside a Goal scope. The two keys SEN-119 saw overturned were overturned for *missing* evidence by searches aimed at the exact claim; a pack aimed at the subject will miss more of them, and the Judge's rule is "unconfirmed if the excerpts say nothing about it", which sends the item into a rewrite round for nothing. Keeping that rule costs rounds; relaxing it (keys the pack does not cover are not checked) leaves the blind Judge as the only check on those keys, which is where we were before the fact-check existed. And a pack in the author's prompt and the Judge's prompt is one source of truth for both: a wrong vendor excerpt fools them together. Today the author writes from its own knowledge and the Judge confirms against pages it found itself; the key has to survive two independent views.

If we still want the measurement the ticket asks for, it is cheap: replay the 34 stored Sol-era claims (`starting_level_diagnostics.reviews[].factCheck`, with each item's stem and key) against one Research pack per goal, three goals, through the existing confirm prompt in `fact-check.ts`. About $0.20 and an afternoon. The pass bar would be 34 of 34 confirmed from the pack alone. I have not run it, because even a perfect score leaves the pack dearer and no faster than what it replaces.

## 4. Sharing the Course's research

The order is Starting Level → Blueprint → Approve → generation, and research is one call per Reading slot on a topic built from that slot's title, Lesson goal and objectives (`course-generation.ts`, spec §5.2 and §5.3). Three things follow:

- The research does not exist when the check runs; it starts ten to thirty minutes later, after the Learner approves the Blueprint.
- The topics are Lesson-narrow, not subject-wide, and there is one pair per Lesson, so no single pack covers the eight capabilities.
- Lessons are planned for the remaining gap only. The capabilities the Learner evidenced are exactly the ones no Lesson researches, so the check would have the least evidence where it needs it most.

Running the check after the Blueprint would mean designing the Blueprint without a Starting Level, which is the input it is designed for. A subject-level pack bought before the check and handed on to the Blueprint author would be a third research input §5.3 does not ask for, on top of the two per-Lesson packs it does, and ADR 0005 keeps packs unpersisted until a Lesson is written. The shares do not line up.

## 5. Brand new to this, and the items a Learner sees

ADR 0021 already removes the check for Learners who say they are new (7 of 28 attempts in 30 days). The Learners left are the ones who claim some knowledge, which is precisely where a floor-only pruning tree triggers least. With a tree, the gap between items authored and items seen is pure cost: 16 to 20 items authored, judged and fact-checked for a Learner who answers 5 to 8. Today that gap is zero.

## 6. What would actually shorten the wait, and what it costs

The launch requirement (SEN-106 decision, Ben's comment on this ticket) is that preparing a check cannot sit silent on one HTTP request for 5 minutes. Three steps, cheapest first; each is a ticket on its own, not this one.

**a. Take the preparation off the request clock.** The POST claims the lease (ADR 0023), starts the build, and answers at once with the Request in `assessment_preparing`. The browser already polls GET every 3 s while a Request is in that status (`level-stage.tsx`, `POLL_MS`), already tolerates a prepare reply without items, and GET already hands back a lapsed lease as "interrupted". The build keeps running in the API process under its heartbeat; a redeploy kills it, the lease lapses within 60 s, and the Learner sees Try again, as today. This amends ADR 0023's "still runs inside its API request" without making the check a generation job, which that ADR rejected for the queue and Waiting view it would add. No model or vendor cost. Removes the cutoff; does not shorten anything. A few hours including the route and web tests. Rejected alternative: writing keep-alive whitespace into a chunked JSON reply every 30 s, which works but hides a slow step from every proxy and log.

**b. The fallback author rewrites the failing items instead of writing a new set.** Both tails were Sol spending 198 s on three rounds and then Terra spending 96 s on eight new items of which six or seven were as good as the ones thrown away. If rounds three and four hand the still-failing items to Terra as a rewriter, the tail is about 198 + 8 + 10 + 5 = 220 s and $0.09 instead of 294 s and $0.15. §4.3's "retry once with the fallback Generator" reads either way; ADR 0015 already gathers every model that wrote any item and keeps the Judge off all of them. Needs a decision-log entry and a change to `build` in `diagnostic.ts`. Whether Terra fixes what Sol could not is the open question; in the 10:28 case neither did, and a capability whose items keep failing might be better re-decomposed than rewritten.

**c. Teach the author the Judge's one recurring flaw.** Twelve of the thirteen Judge failures in round 0 were implausible distractors, and four of the four code failures were the stem-word repeat the rules already name. A rule in `ITEM_RULES` with the Judge's own words ("each distractor is a belief a Learner with partial knowledge could hold; an option an outsider could rule out is a flaw"), with one example, is a prompt edit. If round-0 passes rise from 57% to about 85% of items, half the sets finish in one round at about 65 s. Measure with ten runs of `pnpm check:starting-level:live` before and after, about $1.

**d. Only if a to c leave the wait too long: show the first question before the whole set is checked.** Items that pass the code checks, the Judge and the fact-check in round 0 (four or five of eight, ready at about 65 s) are shown in span order while the rewrite round runs; a Learner spends 15 to 35 s an item, so the rest are ready before they are reached, and nothing is shown that could later be withdrawn. Time to first question about 65 s. A real build: the attempt row is written before every item has passed, `assessment_ready` splits into partly and fully ready, ADR 0006's browser-only partial answers meet a server-side partial set, and the fallback set has to keep the items already answered. Not now.

Not recommended: Terra first (26 s and half the price per call, but two sets is no pass-rate record, and ADR 0028 turned it down on that ground), and dropping the fact-check (it is $0.04 and 10 s, and it is the only check on a key that is not a model's opinion).

## 7. Recommendation and decision

**Recommendation:** do not build the decision tree, and do not move the check onto one upfront pack. The cost case they were meant to answer was closed by SEN-120 and SEN-122, the tree conflicts with §4.3's map of eight capabilities, and the pack costs about what the searches it replaces cost, is no faster, and weakens the Judge's independence. Treat the 5-minute limit as its own ticket with step a, then b and c measured with the live check.

**Decision:** agreed on 2026-11-04 (Ben): the decision tree and the upfront pack are not built. The 5-minute limit is its own ticket, SEN-131, with steps a, b and c in that order. Logged in `docs/decisions/2026-11-04-the-starting-level-check-stays-eight-fixed-items-with-per-claim-search.md`.

## Appendix: the queries

Calls inside item sets, by schema, for the Sol era:

```sql
select u.request->>'schemaName' as schema, u.model_id, count(*) as calls,
  round(avg(u.prompt_tokens)) as p_tok, round(avg(u.completion_tokens)) as c_tok, round(avg(u.reasoning_tokens)) as r_tok,
  round(avg(u.cost_usd)::numeric, 4) as avg_usd, round(avg(u.duration_ms)/1000.0, 1) as avg_s
from usage_records u join pipeline_events e on u.pipeline_event_id = e.id
where e.kind in ('diagnostic', 'fact_check') and e.started_at > '2026-11-01 17:00'
group by 1, 2 order by 1, 2;
```

Each item set with its rounds, fact-check rounds and cost:

```sql
select e.started_at, round(extract(epoch from (e.finished_at - e.started_at))) as secs, e.status,
  e.detail->>'authorModelId' as author, e.detail->>'rounds' as rounds,
  (select count(*) from pipeline_events c where c.parent_id = e.id and c.kind = 'fact_check') as fc_rounds,
  (select round(sum(u.cost_usd)::numeric, 3) from usage_records u where u.pipeline_event_id = e.id) as model_usd,
  (select round(sum(u.cost_usd)::numeric, 3) from usage_records u join pipeline_events c on u.pipeline_event_id = c.id where c.parent_id = e.id) as fc_usd
from pipeline_events e
where e.kind = 'diagnostic' and e.label = 'Item set' and e.started_at > now() - interval '30 days'
order by e.started_at;
```

Why items fail review, from the stored reviews:

```sql
with r as (
  select jsonb_array_elements(d.reviews) as rv from starting_level_diagnostics d where d.created_at > '2026-11-01 17:00'
)
select count(*) as reviews,
  count(*) filter (where (rv->>'round')::int = 0) as round0,
  count(*) filter (where (rv->>'round')::int = 0 and (rv->>'passed')::bool) as round0_passed,
  count(*) filter (where jsonb_array_length(rv->'codeFailures') > 0) as code_failed,
  count(*) filter (where rv->'judge' != 'null'::jsonb and jsonb_array_length(rv->'judge'->'flaws') > 0) as judge_flaws,
  count(*) filter (where rv->'judge' != 'null'::jsonb and jsonb_array_length(rv->'judge'->'defensibleOptions') != 1) as key_disputed,
  count(*) filter (where rv->'factCheck' != 'null'::jsonb) as fact_checked,
  count(*) filter (where rv->'factCheck' != 'null'::jsonb and not (rv->'factCheck'->>'confirmed')::bool) as unconfirmed
from r;
```
