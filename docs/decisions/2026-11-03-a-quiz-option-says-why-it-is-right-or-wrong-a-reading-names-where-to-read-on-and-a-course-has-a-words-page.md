---
date: 2026-11-03
tickets: SEN-48
people: Yarden
status: active
---

# A Quiz option says why it is right or wrong, a Reading names where to read on, and a Course has a Words page

**Why:** Three findings from the hard read of the third SEN-48 Course were left open, and Yarden asked for them to be fixed. Each is a piece of the mattpocock `teach` skill we adopted today: a tight feedback loop on practice, one primary source worth reading per lesson, and a glossary the learner returns to.

**Feedback per option.** The Quiz author wrote `{opt3}` in an explanation and the pipeline swapped in the option's full text after shuffling, so a Learner who picked wrong read sentences like "In 'Hans Christian Gram developed it in 1848 to grow bacteria and compare their growth conditions.', the date is wrong". Every option now carries a one-sentence `why`: for the key, the Lesson statement that makes it right; for a distractor, the Lesson statement it contradicts, naming the wrong part when it mixes right and wrong. The author schema requires it, the Code checks fail an item without it or with a why that names an option by letter, the Judge reads each option's text with its why and fails `explanation_support` when a why is unsupported or empty of reason, and the three-level explanations no longer quote options; the detailed level names the confusion each distractor comes from in a few words. The why is stored on the option, stripped from the public body, and reaches the browser only inside the answer key, as `optionNotes`, once the item has feedback. Study shows each note under its option. An older Quiz has no whys and plays as before.

**Start here.** The Sources panel now opens with the Source the Lesson leaned on most, counted from its inline citations, ties to the lower number, under a "start here" ribbon. We turned down asking the author to pick one and say why: it would add a field to a strict schema that the repair, fit, and reuse paths all carry, and a "why" about a whole page is a claim the excerpts rarely support. The most-cited Source is already vetted and already the one the Lesson rests on; if the pick disappoints, an author pick can replace the count later.

**A Words page.** The Course keeps one meaning per word since this morning, so the words of all its Readings are one list. Study gets `/study/:courseId/words`: every word a Reading defined, grouped by the Lesson that introduced it, each linking back, with a filter box; words of a Lesson still locked in linear order are not shown, only counted. It is built from the Study payload the browser already holds, so no new read endpoint; opening it records the product event `course_words_opened` with the word count. Entry points are a row at the end of the Course outline and a line under a Reading's Sources.

**Cost.** One more required sentence per option in each Quiz, about four hundred tokens of output per Quiz. The Code check for a why on every option means a Quiz written by a model that skips one is repaired, as any other shape failure is.
