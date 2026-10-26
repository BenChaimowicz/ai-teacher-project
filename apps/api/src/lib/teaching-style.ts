// The style guide every Lesson author writes to (SEN-80), folded into the authoring prompts instead of a separate rewrite
// stage. Like every generation prompt, it names no subject (ADR 0011).

/** One teaching voice across Readings and Quizzes, so a Course reads as if one teacher wrote it. */
export const TEACHING_VOICE = `Write as a good teacher talking to this one Learner: warm, direct, and plain, addressing them as "you". Prefer concrete words to abstract ones and short sentences to long ones. No filler or hype ("fascinating", "let's dive in", "in today's world"), no praise of the Learner, and no promises about later Lessons.`;

/**
 * When an analogy or an invented example is teaching and not a claim. The author and the Judge are given this same text,
 * so they decide it the same way (ADR 0016).
 */
export const ILLUSTRATION_RULE = `An analogy to everyday life, or an invented example plainly marked as one ("Think of it like…", "Imagine…", "Suppose…"), is a teaching device, not a claim about the subject, and needs no Citation. It must state no fact about the subject that the excerpts do not, and the sentence that maps it back onto the subject is a factual sentence like any other. Never present an invented example as history, data, or a real case.`;

/** How a Reading teaches rather than summarises. Every move here adds structure or explanation, never new facts. */
export const READING_STYLE = `Teach; do not summarise. ${TEACHING_VOICE}
- Open the Lesson with why it matters for the learningGoal, or with a question it will answer, then say in one sentence what it covers. When there are priorLessons, link to what the Learner already knows in one sentence, in their terms.
- Build each idea in steps: a concrete case and the principle, in the order explanationOrder asks; then what the idea means; then how it connects to the idea before it.
- Where an idea is abstract, give an example. A worked example walks through one case step by step, saying at each step what happens and why; take its facts from the excerpts.
- ${ILLUSTRATION_RULE}
- Headings name the idea a section teaches, never a label like "Introduction" or "Overview". Open each section after the first with a sentence that says how it follows from the one before.
- End most sections with one question to the Learner that the section has just answered, to check their understanding ("Can you say why…?"). The question adds no fact.
- End the Lesson with a short section that recaps its key ideas in a few sentences, citing each one again.
These teaching moves never loosen the grounding rules: a sentence that states a fact still needs an excerpt that states it.`;

/** How Quiz items and their explanations teach, in the same voice as the Readings. */
export const QUIZ_STYLE = `${TEACHING_VOICE}
- Write each prompt as a plain, complete question the Learner can answer before reading the options. Avoid negatives ("Which is NOT…") unless the objective is about telling things apart.
- Where an objective asks the Learner to explain, apply, or compare, prefer an item that puts the idea to use: a short situation, plainly invented, that the Learner reasons about with what the Lessons teach. Its keyed answer must follow from the Lessons alone, and the situation states no fact about the subject that the Lessons do not.
- Explanations teach: start with the idea from the Lessons that makes the answer right, then show how it settles this item. Do not just repeat the answer.`;
