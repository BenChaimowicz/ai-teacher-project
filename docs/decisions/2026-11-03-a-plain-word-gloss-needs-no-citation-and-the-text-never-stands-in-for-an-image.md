---
date: 2026-11-03
tickets: SEN-48
people: Yarden
status: active
---

# A plain-word gloss needs no Citation, and the text never stands in for an image

**Why:** Two failures in the third SEN-48 Gram-stain Course came from the grounding rules and the Judge pulling against the newcomer rules, not from a model being careless.

The first was the word "culture". The Judge failed the Lesson "A useful first clue" for assumed knowledge because "culture" was unexplained, the author added "Growing bacteria in this way is called culture", and the Judge then failed that sentence for claim support because no excerpt "explains that culture means growing bacteria"; the repair cut it, and the Learner was left with the bare word. The next Lesson went through three repairs and the fallback model on the same word, about a tenth of the Course's cost, and ended with the gloss anyway. The Word list, meanwhile, said "culture: the growing of bacteria for further study" without objection. A gloss that gives a word's ordinary meaning is a definition, not a claim about the subject, and the rules now say so in one place.

The second was a picture in the prose. The Judge failed "What purple and pink mean" for objective coverage because the Blueprint objective asked the Learner to tell the two results apart "in labeled microscope images" and the text "does not provide a labeled microscope image". The repair, which can only edit prose, provided one: it wrote `![Microscope image, Figure 2.34: …](src_8b67c17825)` and `**Image labels:** The purple circles are Gram-positive…` into the paragraph, copying a figure number from the OpenStax excerpt. Study renders prose as plain text, so the Learner saw the raw syntax, a bold label that labels nothing, and a figure they do not have, while the Lesson's two real photographs sat below. No Code check caught it, because none looked for markup.

**Decision.** A plain-word gloss of a term the Lesson uses, in the word's ordinary meaning in the field ("a culture, bacteria grown in a lab"), needs no Citation; it is wrong only when it contradicts the excerpts or how they use the term, and it never adds a fact about the subject beyond the word's meaning. The author, repair, fit pass, and Judge share this rule (`GLOSS_RULE`), the Judge's assumed_knowledge check counts such a gloss as explaining the term, and the Word list writer and Judge work the same way: a definition gives the ordinary meaning, and is rejected for contradicting the Lesson or the excerpts, not for lacking an excerpt.

Images are blocks, never text. The Code checks fail any Reading whose prose or headings carry Markdown or HTML (image or link syntax, bold, tags, URLs, a heading or list at a line start) and name the markup, so a repair cannot pass it. The Judge never fails objective coverage for a missing image, figure, or label: an objective about seeing something is covered by prose that says what to look for, and the images are attached outside the text it sees. The repair prompt says a repair edits prose only and cannot add an image, and the Reading shape says never to refer to a figure, picture, label, or page of a Source, which the Learner does not have.

**Turned down.** Letting the repair request an image (the media step already attaches the slot's required images, and a second path would be a second source of truth). A Judge rule that reads the images (the vision Judge checks each image against its caption separately, and the text Judge should not depend on it).

**Cost.** A wrong gloss can pass when the excerpts neither state nor contradict the word's meaning; we accept that because a gloss carries no fact beyond the word, and a contradiction still fails. The markup check is a regular expression over prose, so a legitimate paragraph that opens with a number and a period, or contains a double underscore, would be failed and repaired; neither has appeared in a Reading so far.
