---
date: 2026-10-31
tickets: SEN-46, SEN-113
people: Ben
status: active
---

# A reuse candidate whose write-time Teaching Profile fields differ from this Learner's is adapted at most, never reused verbatim; a different instruction language drops it from retrieval

The reuse pool is every Learner's published Lessons, and each was written for one Learner's write-time fields: `instructionLanguage`, `requiredReadingSupports`, `contentScope`, and `explanationOrder`. Spec §5.8 judges fit on objectives and terminology only, so as written a Lesson pitched as compact and plain-language for one Learner could reach another Learner verbatim. Verbatim now needs all four fields to match. Any other difference makes the candidate an adapt at most, because an adapt pass can trim, re-scope, and add reading supports. A different instruction language cannot be adapted into this one without translating the whole Lesson, so that candidate is never retrieved. Today every profile resolves to English, so this rule only protects the future.

**What we turned down:** retrieving only candidates whose four fields all match. That is the safest choice, but it splits a pool that is already small into one slice per profile combination, so reuse would almost never fire. Ignoring the profile, as the spec does today, would hand Learners Lessons written for someone else's declared needs.

**What it costs:** more candidates go through an adapt pass instead of being copied, and that pass is a model call. A mismatch an adapt pass cannot honestly bridge becomes a fall-through to generate, which researches that slot during writing (see the entry deciding reuse before research).
