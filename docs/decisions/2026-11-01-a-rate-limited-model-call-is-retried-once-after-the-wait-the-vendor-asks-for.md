---
date: 2026-11-01
tickets: SEN-120
people: Yarden
status: active
---

# A model call that OpenRouter rate-limits is retried once, on the same model, after the wait OpenRouter asks for

**Why:** On 2026-11-01 the founders moved Knibbler to a new OpenRouter account, and OpenRouter caps new accounts at 20 requests a minute per model until they have a spending history ("new-account-rpm", read from the 429 bodies the Usage Records kept). The Starting Level fact-check sends up to eight Judge reads at once, and the SEN-120 comparison hit the cap at four. ADR 0015 does not retry HTTP errors because "the others will not change on a second try", which is true of a 401 or a 500 and false of a 429 whose body says "please retry shortly". Today one such answer fails the whole Starting Level preparation and the Learner sees "Try again".

The model ports now retry a 429 once on the same model, after the wait OpenRouter's reply gives (its `Retry-After` header or the rate-limit reset time), capped at thirty seconds and five seconds when the reply gives none. Everything else in ADR 0015 stands: timeouts, refusals and other HTTP errors are not retried, and a bad reply is retried once then falls back.

We turned down leaving the code alone and only asking OpenRouter to lift the cap: the cap lifts on their schedule, and two Learners at once can hit it on any account.

**What it costs:** a rate-limited step waits up to thirty seconds longer and makes one more call, which costs nothing when it is refused again. The retried call is recorded under the same attempt number as the refused one; the refused one keeps its own Usage Record with its 429 body.
