---
date: 2026-10-31
tickets: SEN-115, SEN-113, SEN-55, SEN-50, SEN-48
people: Ben
status: active
---

# Required Demonstrative media is its own ticket between the media vertical slice and the drum and microbiology test Courses

SEN-55 proves one optional image in one Reading: the writer may propose it, and a catalog miss drops it without harming the Lesson. The drum Course (spec §7.2) and the microbiology proof (§7.1) both need media a Lesson cannot ship without: grip, stroke, and coordination stills for drums, and real Gram photomicrographs for microbiology. That needs four things SEN-55 leaves out: a way to mark a slot's media as required, a miss that becomes a Lesson defect and flows through the repair budget, Retry, and the Learner-facing failure reason, more than one media block in a Reading, and a call on the rebound-stroke loop. The new ticket builds these, with a catalog miss as the only failure path: no Commons or PHIL copying and no image generation. SEN-55 blocks it, and it blocks SEN-48 and SEN-50.

**What we turned down:** folding this work into SEN-50. Both test Courses need the same machinery, so SEN-48 would depend on a drum ticket. Both are sign-off runs done by a person, and building features inside one would make its Done mean shipped code and a passed sign-off at once.

**What it costs:** one more ticket and one more PR before either test Course can run. With a catalog-only miss, either Course fails whenever its Blueprint asks for media the seed catalog (SEN-47) does not cover, so the seed has to be chosen with those two Courses in mind.
