---
date: 2026-11-02
tickets: SEN-48
people: Yarden
status: active
---

# A Reading carries a checked word list the Learner can open while reading

**Why:** Even in plain words, a Reading has to name things a newcomer has never heard of, such as peptidoglycan, crystal violet, or a membrane. A definition in the sentence helps once, but the Learner forgets it three paragraphs later and has to scroll back. Each Reading now carries up to 12 words, shown underlined where they first appear in each section. Hovering or tapping a word opens its definition, and a "Words to know" list sits beside the text. Opening a word logs `glossary_term_opened`, so we can see which words Learners need.

The list is written after the prose passes its checks. The author picks the words and defines each in one plain sentence from what the Lesson and its excerpts say. Code drops any word that is not in the prose, and the Judge drops any definition it cannot back. A bad word is dropped, never repaired, and a provider failure leaves the Lesson without a list. We turned down having the author write the list with the draft, because then every repair and reuse fit would have to keep it in step with the prose.

The cost is two more model calls per Reading, at medium effort. Definitions also carry no Citation, so they rest on the Judge's check rather than a number the Learner can follow.
