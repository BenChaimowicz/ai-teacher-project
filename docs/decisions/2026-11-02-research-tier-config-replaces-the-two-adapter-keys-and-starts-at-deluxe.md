---
date: 2026-11-02
tickets: SEN-124
people: Yarden
status: active
---

# `RESEARCH_TIER` (`deluxe`, `regular`, `auto`) replaces `PRIMARY_RESEARCH_ADAPTER` and `SECONDARY_RESEARCH_ADAPTER`, and starts at `deluxe`

**Why:** With a tier on each Request, the adapter pair for each tier lives in code, and the env says only which tier applies. Keeping the two adapter keys as well would put the same fact in two places that can drift. `deluxe` is the default, so nothing changes in production until we choose. The test-Course run uses `regular`. `auto` applies the rating and is switched on only after that run passes. In every mode the rating is still stored, so the Usage Console shows what `auto` would have picked.

We turned down keeping the adapter keys as a per-slot override. Nobody uses them except to pick a tier, and the 2026-11-01 Parallel `core` comparison goes through its own live check.

**What it costs:** trying a new adapter pairing means a code change, not an env edit. `.env.example` and the Usage Console's setup page change with it.
