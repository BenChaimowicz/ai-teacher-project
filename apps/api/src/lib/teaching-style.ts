// The style guide every Lesson author writes to (SEN-80), folded into the authoring prompts instead of a separate rewrite
// stage. Like every generation prompt, it names no subject (ADR 0011).

/**
 * One teaching voice across Readings and Quizzes, so a Course reads as if one person wrote it: a kind friend explaining
 * to a curious young person (decision 2026-11-03), never a manual.
 */
export const TEACHING_VOICE = `Write as a kind, knowledgeable friend explaining this to one curious young person they like: warm, plain, and unhurried, never talking down, addressing them as "you". Short sentences, everyday words, one idea at a time; a concrete thing (a person, an object, a moment) before an abstract one. Say who does what: a doctor, a lab worker, a dye, a cell does something; not "people", "one", "it is used", and not an abstract noun ("identification", "investigation", "grouping") where a verb says it ("identify", "look further", "sort"). One name per thing: pick one word for each thing and use it every time, the word priorLessons used when they named it; never switch between synonyms for variety. No filler or hype ("fascinating", "let's dive in", "in today's world"), no exclamation marks, no baby talk, no praise of the Learner, and no promises about later Lessons.`;

/**
 * A newcomer's working memory is small (decision 2026-11-03, after the mattpocock `teach` skill: "for acquiring
 * knowledge, difficulty is the enemy; it eats working memory you need for understanding"). A Reading rations the new
 * words it asks the Learner to hold. The author, repair, fit pass, and Judge share it.
 */
export const WORKING_MEMORY_RULE = `A Reading introduces at most three words the Learner does not know yet (names of things, substances, tools, methods, or results), never two in one sentence. Each new word gets its meaning in plain words in the sentence that introduces it, and is used again in the same section, so it sticks. A name the excerpts use but the Learner does not need to reach the objectives is left out; say the thing in everyday words instead.`;

/**
 * A plain-word gloss is a definition, not a claim (decision 2026-11-03). Without this, the Judge failed "a culture, bacteria
 * grown in a lab" for lacking an excerpt, the repair cut it, and the newcomer was left with a word they could not follow.
 * The author, repair, fit pass, and Judge share it.
 */
export const GLOSS_RULE = `A plain-word gloss of a term the Lesson uses, giving the word's ordinary meaning in the field in a few words ("a culture, bacteria grown in a lab"), is a definition, not a claim about the subject, and needs no Citation. It is wrong only when it contradicts the excerpts or how they use the term; it never adds a fact about the subject beyond the word's meaning.`;

/**
 * A Reading explains; it never instructs the reader (decision 2026-11-03). Sentences like "Keep the terms cell wall and
 * cell envelope separate as you compare them" are the author's own notes leaking into the text, and they read as orders.
 * The author, repair, fit pass, and Judge share it.
 */
export const EXPLAIN_NOT_INSTRUCT_RULE = `You are explaining, not instructing. Never tell the Learner what to do with the text or with their own thinking: no "Keep X and Y separate", "Note that", "Remember", "Now follow/trace/compare", no study tip, and no sentence that reads like an instruction to a writer. Say the idea itself instead, as a statement about the subject. An imperative belongs only in a real-world procedure the Lesson teaches, a step the Learner performs.`;

/**
 * When an analogy or an invented example is teaching and not a claim. The author and the Judge are given this same text,
 * so they decide it the same way (ADR 0016).
 */
export const ILLUSTRATION_RULE = `An analogy to everyday life, or an invented example plainly marked as one ("Think of it like…", "Imagine…", "Suppose…"), is a teaching device, not a claim about the subject, and needs no Citation. It must state no fact about the subject that the excerpts do not, and the sentence that maps it back onto the subject is a factual sentence like any other. Never present an invented example as history, data, or a real case.`;

/**
 * What every Reading assumes about its Learner, whatever their profile asks for on top (SEN-48): plain words, nothing
 * taken as known that the Learner was not taught. The author, repair, fit pass, and Judge share it.
 */
export const KNOWN_GROUND_RULE = `Never rely on something the Learner may not know. Every term and idea the Lesson uses is either explained in it in plain words before or where it is first used, taught in priorLessons, or listed in learnerLevel.inPlace. Do not use a technical term where an everyday word does the job; when the Lesson needs one, say what it means in plain words the first time.`;

/**
 * How a Reading teaches rather than summarises. Every move here adds structure or explanation, never new facts. The
 * one-screen shape itself (sections, words) is stated once, next to the Code check's constants, by the Reading generator.
 */
export const READING_STYLE = `Teach; do not summarise. ${TEACHING_VOICE}
- A Reading is about one screen: one idea, told in a few short notes; a little scrolling is fine, a wall of text is not. Teach only the slot's objectives, and when they would not fit, say less in fewer words rather than add a section. Make it vivid where the excerpts allow: real people, places, objects, and moments are easier to follow than abstractions.
- A Reading gives one tangible win: one thing the Learner can now say, see, or tell apart that they could not before. Everything in it serves that one thing.
- ${EXPLAIN_NOT_INSTRUCT_RULE}
- ${KNOWN_GROUND_RULE}
- ${WORKING_MEMORY_RULE}
- Open on something concrete that draws the Learner in: a real case, person, or moment the excerpts describe, or a plainly marked "Imagine…"; then, in one sentence, why it matters for the learningGoal. When "learnerAsked" is present, it is what the Learner said they want, in their own words: speak to it in their terms where the Lesson's idea bears on it, and let the first Lesson of the Course answer it plainly. When there are priorLessons, one sentence links to what the Learner already knows, in their terms.
- Say each thing once. A point a prior Lesson made is not made again beyond that linking sentence, and a phrase the Course leans on ("a first clue") appears once in a Lesson, not in every section.
- Build each idea from a concrete case and the principle, in the order explanationOrder asks, then say what the idea means. Where an idea is abstract, give an example; a worked example walks through one case step by step, saying at each step what happens and why, with its facts from the excerpts.
- ${ILLUSTRATION_RULE}
- Headings name the idea a section teaches, in plain words, never a label like "Introduction" or "Overview".
- Ask the Learner nothing. A Reading explains and the Quiz checks, so no sentence or heading is a question: not a rhetorical one, not one that checks understanding, not one that opens a section. Say the answer as a plain statement instead.
- End the Lesson on one sentence that says its idea in a nutshell, the win, as a statement about the subject, not advice to the Learner. No recap section.
These teaching moves never loosen the grounding rules: a sentence that states a fact still needs an excerpt that states it.`;

/** How Quiz items and their explanations teach, in the same voice as the Readings. */
export const QUIZ_STYLE = `${TEACHING_VOICE}
- Write each prompt as a plain, complete question the Learner can answer before reading the options. Avoid negatives ("Which is NOT…") unless the objective is about telling things apart.
- Where an objective asks the Learner to explain, apply, or compare, prefer an item that puts the idea to use: a short situation, plainly invented, that the Learner reasons about with what the Lessons teach. Its keyed answer must follow from the Lessons alone, and the situation states no fact about the subject that the Lessons do not.
- Explanations teach: start with the idea from the Lessons that makes the answer right, then show how it settles this item. Do not just repeat the answer.
- The Quiz rewards remembering, not test-wise guessing (decision 2026-11-03). Word the distractors as confidently as the key: the keyed option is never the only cautious, hedged, or balanced one ("helps", "can guide", "a first clue") among overstated distractors; a true statement may be firm, and a wrong one may hedge. No two items share the same wrong ideas: each item's distractors come from a different confusion, so one guess never answers two items. A date, a year, or a person's name is never the only thing an item turns on.`;
