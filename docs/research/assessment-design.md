# Assessment design: Starting Level diagnostic and Teaching Profile

**Date:** 2026-09-02

How should the prototype combine a Learner-selected Learning Goal with a generated diagnostic that estimates the goal-specific Starting Level and, when needed, applies the Learner's reusable Teaching Profile?

---

This note reopens a previous self-report-only assessment boundary. The destination wants a generated diagnostic of current capability relative to the Learning Goal, not only “rate yourself.” The Teaching Profile remains the SEN-24 questionnaire: eight independent needs/preference fields, not a score, not an ability estimate, not a source of Starting Level. Assessment happens after the Validity gate and before Blueprint generation and Lesson Source retrieval. The Course Guide presents the flow; it does not own or override policy.

## 2. Recommendation

**Use a short, goal-decomposed diagnostic of evidenced prerequisite capability, not a 0–100 placement score, not an in-Course Quiz, and not a self-rating of mastery.** After the Validity gate passes, run Teaching Profile questions only if none exists or the Learner has explicitly requested reassessment. Then, on every Course Request, the Generator decomposes the Learning Goal into eight prerequisite capabilities spanning likely-novice through near-goal, writes one three-option single-correct MCQ per capability, and offers a separate **I don’t know** omit. Map each response onto that capability as *evidenced* (correct) or *not evidenced* (incorrect, I don’t know, or skipped). Hand the Blueprint a **Starting Level** object: the list of probed capabilities with those statuses, a short remaining-gap statement, and an honesty/coverage note. Do not compute or display a percent-correct “proficiency,” and do not write Starting Level onto Progress.

This is the defensible interpretation under the testing Standards: validity is for an interpretation and use, not for “the test.” The supported use is narrow: *these responses are a coarse sample of related knowledge used to scope a remaining-gap Course, not a certification that the Learner can perform the goal in the world.* More ambitious uses—calibrated placement, IRT/CAT θ, ALEKS-style knowledge-state recovery, motor-skill or wet-lab competence, IQ, learning-style, or a Progress inheritance—are not supported by an uncalibrated eight-item generated form.

The Teaching Profile is orthogonal. Amount of scaffolding and worked-example *dosage* follows Starting Level (expertise reversal). Profile `explanationOrder` may change example-then-principle *order*, never dosage, and never the remaining-gap. Starting Level never updates the Profile.

### 2.1 Decision text for the Linear resolution comment

> Resolve with a generated Starting Level diagnostic on every Course Request after the Validity gate, independent of the Teaching Profile. The Generator decomposes the Learning Goal into eight prerequisite capabilities and writes one three-option single-correct MCQ per capability plus a separate “I don’t know”; items are checked against Haladyna-style item-writing rules and a second-model Judge, with a bounded fact-check of keys that is not Lesson Source retrieval. Map responses to an evidenced-capability list and a remaining-gap statement for the Blueprint—not a 0–100 score and not Progress. Treat correct as evidenced knowledge only; treat incorrect, I don’t know, and skip as not evidenced. Ask Teaching Profile questions only if none exists or the Learner explicitly reassesses; never infer Profile from the diagnostic or Starting Level from the Profile. The Course Guide presents the flow and honesty copy but does not own policy. Do not claim certified placement, motor-skill or wet-lab competence, IQ, learning style, or Quiz/Progress semantics.

---

## 3. What interpretation this diagnostic may support

### 3.1 Validity is for an interpretation and use, not for a form

The AERA/APA/NCME *Standards* define validity as the degree to which evidence and theory support the *interpretations of scores for proposed uses*. It is those interpretations that are evaluated, not “the test.” Statements about “the validity of the diagnostic” are incorrect; each intended interpretation must be validated. Kane’s argument-based view is the same point in operational form: more ambitious claims need more support; rejecting a use does not automatically invalidate a narrower interpretation underneath it.

The prototype’s proposed interpretation is:

> Given this Learning Goal, these eight responses are a coarse sample of related knowledge and “knows-how” in words. Capabilities answered correctly may be treated as already in place for Blueprint scoping. Capabilities answered incorrectly, marked I don’t know, or skipped are not evidenced and belong in the remaining-gap. This does not certify goal attainment, predict Course completion, measure intelligence, or re-estimate Progress.

That use is closer to the Standards’ example of a mathematics test used to assess readiness for an advanced course (content aligned to prerequisites; scores not unduly driven by ancillary skills) than to licensure, promotion, or credentialing. Even for placement-like uses, the Standards expect evidence that alternative placements are differentially beneficial, and they warn that high-stakes student decisions should not rest on a single indicator. The prototype therefore keeps stakes low: the Learner reviews the Blueprint; a different Starting Level is a different Course; published Courses are immutable; the diagnostic is not a Progress gate.

Construct underrepresentation and construct-irrelevant variance are the two standing rival hypotheses. An eight-item verbal MCQ *underrepresents* wet-lab technique, kit performance, and any full knowledge state of a domain. Guessing, item-writing flaws, English reading load, and test-wiseness are *irrelevant* to the intended construct if they drive the remaining-gap. The design below is aimed at shrinking those threats, not at eliminating them. The honesty copy must say so.

### 3.2 Why self-report-only of mastery is not enough (and what self-report can still do)

Sitzmann, Ely, Brown, and Bauer’s meta-analysis (166 studies, 222 samples, *N* = 41,237) found self-assessed knowledge correlated only moderately with cognitive learning (mean corrected *ρ* = .34; uncorrected *r* = .27) and more strongly with affective outcomes: reactions/satisfaction *ρ* = .51, motivation *ρ* = .59. Thirty-two percent of evaluation studies still treated self-assessed knowledge as evidence of learning. Even when learners practiced self-assessment and received feedback, the self-assessment–learning relationship stayed weaker than the self-assessment–motivation relationship.

Kruger and Dunning showed the calibration problem at the low end: participants in the bottom quartile on humor, grammar, and logic tests averaged about the 12th percentile but estimated themselves near the 62nd. The same incompetence that produces errors also impairs the metacognition needed to detect those errors. Falchikov and Boud’s meta-analysis of student vs teacher marks found correspondence closer in better-designed studies, in advanced rather than introductory courses, and in science more than other areas—i.e. accuracy is conditional, not a general license to “rate yourself.”

Dochy, Segers, and Buehl’s review of prior-knowledge research found prior knowledge generally helps performance, but *assessment method matters*: flawed measures were more likely to show null or negative effects. Hailikari, Katajavuori, and Lindblom-Ylänne distinguish declarative “knowing about” from procedural “knowing how.” In their pharmacy sequence, factual prior knowledge did not predict later achievement; application-level prior knowledge (especially organic chemistry application) did. Hailikari, Nevgi, and Lindblom-Ylänne’s mathematics case study is the source of that hierarchical prior-knowledge model.

The implication for this ticket is precise:

- **Reject** a Starting Level that is only “beginner / intermediate / expert” or a 0–100 self-rating of mastery. That is the boundary being reopened, and the evidence says self-assessed *knowledge* is a poor cognitive measure.
- **Allow** self-report of *experience or exposure* as a covariate only if product later wants it (for example “I have never used a drum kit”), and store it as declared experience, not as Starting Level. The prototype does not need this field to ship.
- **Allow** Learner correction of *Course scope* after seeing the remaining-gap statement (too easy → include more fundamentals). That is a remaining-gap choice, not a mastery score. Treat a global “I already know this; make it harder” self-upgrade as high-risk (Kruger–Dunning) and, if offered at all, only as capability-level override with a warning—not as a replacement for the diagnostic.

### 3.3 Why IRT, CAT, and knowledge-space measurement are rejected for the prototype

Item response theory describes a test through calibrated item parameters (difficulty, discrimination, guessing) so that person proficiency and item properties share a scale. Lord’s monograph is explicit that practical IRT uses include item banking, tailored/adaptive testing, and equating—each of which presupposes estimated item parameters, not one-shot generated items. Computerized adaptive testing additionally requires a pool of high-quality items across proficiency levels, an item-selection algorithm, and a stopping rule (Wainer, Dorans, and colleagues’ CAT primer; Reckase on pool design). The prototype has no calibrated item bank, no pretest sample, and no stable domain of reusable items across arbitrary Learner-chosen Learning Goals. Generating eight items at Request time does not create IRT parameters.

Knowledge Space Theory (Doignon & Falmagne, 1985) models a domain as a combinatorial family of knowledge states—not a single number. Falmagne, Cosyn, Doignon, and Thiéry describe the assessor’s job as uncovering the student’s state among a feasibly huge family; in applications the result is two lists: what the student can do, and what the student is ready to learn. Doignon and Falmagne (2015) are equally explicit about cost: building the structure for a scholarly domain is “enormously demanding and time consuming” and relies on dedicated algorithms *and* huge assessment datasets. ALEKS is an application of that theory to relatively closed school-mathematics domains. Citing ALEKS marketing as if the prototype could reproduce it would be a category error. The prototype cannot ship a validated knowledge space per open-ended Learning Goal.

**Rejected-for-prototype (one-liners):**

| Approach | Why not |
| --- | --- |
| IRT θ / 0–100 proficiency | Requires calibrated items; eight uncalibrated items cannot support that interpretation (Lord; AERA reliability/SEM). |
| CAT / two-stage tailored testing | Requires a calibrated pool and selection/stopping rules (Wainer et al.; Lord). |
| Knowledge-space / ALEKS-style state recovery | Requires a constructed state family and large data (Doignon & Falmagne; Falmagne et al. 2006, 2015). |
| Diagnostic classification / latent-class ECD student model | ECD is the right *design* language; shipping a psychometric student model is not (Mislevy, Almond, & Lukas). |
| In-Course Quiz reused as placement | Different purpose, 70% completion, Progress, same-item retakes (locked product). |
| Self-rating of mastery as Starting Level | Poor calibration to cognitive learning (Sitzmann et al.; Kruger & Dunning). |
| Teaching Profile composite or VARK as ability | Already rejected in SEN-24; does not diagnose ability. |

### 3.4 What to borrow from ECD and *Knowing What Students Know*

Mislevy, Almond, and Lukas’s evidence-centered design frames assessment as an argument from what the Learner says, does, or makes in a few situations to inferences about what they know more broadly. Design starts from the claim, then the observations that would support it, then the tasks that elicit those observations. The NRC *Knowing What Students Know* assessment triangle is the same idea as three corners that must stay in sync: **cognition** (what competence in this domain is), **observation** (what tasks can evidence it), **interpretation** (how responses become a conclusion). An assessment samples a handful of performances; scores remain estimates with error; even technically strong tests are imprecise. One assessment serving many purposes compromises each purpose.

For the prototype, ECD/NRC are a *design discipline*, not a model to estimate:

- **Claim:** remaining-gap scope relative to this Learning Goal.
- **Evidence:** correctness vs omit on eight written items, each tied to one prerequisite capability.
- **Interpretation:** evidenced vs not-evidenced list + remaining-gap statement; no latent class, no θ.

Do not ship Bayes nets, Q-matrices, or “probability the Learner has mastered X = 0.73.” That would overclaim the same way a 0–100 score would.

---

## 4. Item devising, format, and checks

### 4.1 Question-devising procedure (no item bank)

Gagné’s learning-hierarchy method is the workable generator-side procedure: start from a clear terminal objective and repeatedly ask *what the individual would already have to be able to do in order to learn this new capability given only instructions*. That yields a small ordered set of subordinate capabilities. White and Gagné’s later review, and White’s 1973 review of hierarchy research, caution that empirically validated hierarchies are not automatic—especially outside mathematics and science—so the prototype must treat the decomposition as a **content blueprint for sampling**, not as a proven knowledge space.

**Procedure the Generator must run after Validity passes:**

1. Restate the Learning Goal as a terminal capability (not a topic list, not a Progress target).
2. Decompose into **eight prerequisite capabilities** that are (a) necessary or strongly supporting for that goal, (b) answerable in English prose/MCQ, and (c) span likely-novice fundamentals through a near-goal check. Mix Hailikari-style levels: not only fact recognition; include at least two application-in-words items (relations among concepts, “what follows if…”).
3. Assign **one item per capability**. Do not write two items that clone the same fact. Keep items locally independent (Haladyna guideline 4).
4. For named copyrighted works that passed Validity, decompose into generic transferable skills (already locked for Learning Goals). Diagnostic items target those skills, not reproduction of the protected copy.
5. Write stems that include the central idea, one correct key, two plausible distractors drawn from typical errors, no “all/none of the above,” no negative stems, no clang with the key (Haladyna et al. 2002 taxonomy).
6. Run the checks in §4.3. Regenerate failing items (cap regenerations). If the set still fails, follow §8 failure modes.
7. Do **not** wait for You.com Lesson Source retrieval. Assessment is before Blueprint and before Lesson search.

**Bounded retrieval vs Lesson Source retrieval.** Default is goal-decomposition only. Add a **bounded fact-check** only after a draft key exists, and only when the Judge (or a deterministic flag) marks the key as an external factual claim (lab protocol, named reagent, attested mythic corpus, historical source attribution). That search is not Lesson Source retrieval: it does not apply the Preference list, does not create Citations, does not store Sources on Lessons, and does not retrieve teaching pages for synthesis. Its only job is to confirm or reject the keyed answer (and to kill items whose key cannot be grounded). Skip retrieval for purely definitional keys that are warranted by the capability statement itself. This is justified by LLM item studies that still find factual inaccuracy and irrelevance in generated MCQs even when psychometrics look acceptable after human review (Law et al.; Wu et al.).

### 4.2 Item count and format

**Eight items; one correct option, two distractors, plus a separate I don’t know; English; untimed.**

Reasons:

- Eight matches a short prior-knowledge form of the Hailikari 2008 kind (their pharmaceutical-chemistry prior-knowledge test used eight tasks) without pretending to be a reliable unidimensional test.
- Rodriguez’s meta-analysis: three options are optimal for MC items in most settings; moving from four to three does not harm discrimination/reliability on average and improves coverage per minute. In-Course Quizzes stay four-option by lock; the diagnostic **should look different** (three content options + I don’t know) so it is not confused with a Quiz.
- AERA: shortening a test generally lowers reliability/precision; random error limits diagnosis and decision quality. Eight dichotomous items cannot support a fine score. They can support a coarse capability map.
- Guessing on three options is still real (~33% if forced). I don’t know exists to reduce forced guessing (see §4.4).

Do not use true/false, K-type (complex MC), all-of-the-above, or none-of-the-above (Haladyna guidelines 9, 25–26).

### 4.3 Generation + check procedure (no human item writer)

LLM-generated MCQs can approach human item statistics *after review*, but they systematically introduce item-writing flaws, weaker distractors, factual misses, and lower-order stems.

- Medical-education comparisons: GPT-4 items can match difficulty/discrimination after panel review, but distractor efficiency is lower (Wu et al.: 39% vs 55% for novice-authored items).
- Law, So, Lui, Choi, Cheung, Hung, and Graham (high-stakes mock): AI items were easier; experts flagged more factual inaccuracy (6% vs 4%), irrelevance (6% vs 0%), and inappropriate difficulty (14% vs 1%); AI items tested lower Bloom levels more often.
- Kaya, Sönmez, Halıcı, Yıldırım, and Çoşkun: AI items often easier, with a higher share classified as psychometrically “problematic.”
- Moore, Nguyen, and colleagues (2023): a rule-based detector of 19 common item-writing flaws (the Tarrant-style IWF rubric) caught 91% of human-identified flaws vs 79% for GPT-4-as-judge on student-generated items. Tarrant, Knierim, Hayes, and Ware found 46.2% of operational nursing MCQs already contained at least one IWF—so “looks like a question” is not a quality bar.
- Downing (2002, 2005): flawed items inject construct-irrelevant variance; in one medical exam, flawed items were harder and failed more students than unflawed items.

**Prototype pipeline (deterministic enough to spec):**

1. **Author model** writes the eight-capability list, then the items, with an explicit key and a one-line warrant per key.
2. **Checklist (code + prompt):** Haladyna subset that a machine can apply: single key; three content options of similar length; no negatives in stem; no all/none of the above; no specific determiners; no stem–key lexical overlap; stem contains the question; vocabulary simple; item independent of other items; construct-relevant (no motor/performance demand; see §6).
3. **Judge model** (the existing Judge-check idea, not the author): independently answers the item *without seeing the key*; flags if it finds 0 or >1 defensible keys; flags IWF; flags construct-irrelevant performance demand; flags ungrounded factual key.
4. **Bounded fact-check** when required (§4.1 step 7).
5. **Regenerate** any item that fails. If ≥3 items still fail after a cap, fail the diagnostic set (§8).
6. **Do not** reuse diagnostic items as Course Quizzes. Do not show correctness as Lesson completion.

This is not a substitute for later human review in a production measurement program. It is the honest prototype substitute for “we have no item writer.”

### 4.4 “I don’t know,” guessing, and omit

Forced-choice number-right scoring treats lucky guesses as knowledge. Formula scoring with a don’t-know option reduces random error but introduces *construct-irrelevant risk-taking*: students less willing to guess score lower even when partial knowledge is present (Muijtjens, van Mameren, Hoogenboom, Evers, & van der Vleuten, 1999). Sanderson (1973, 1976) concluded that a don’t-know option favours the bold and test-wise and can change rank order. Ravesloot et al. note that in *progress testing* the educational purpose of don’t-know is to mark a knowledge deficit rather than to rank.

The prototype is a **deficit-scoping diagnostic**, not a ranking exam. Therefore:

- Offer **I don’t know** as a non-content omit, not as a fifth scored option.
- Instruction: “If you are not reasonably sure, choose I don’t know. Guessing does not help us design your Course.”
- **Do not formula-score** (no −1 for wrong). Wrong and I don’t know are both *not evidenced* for remaining-gap inclusion.
- Keep an internal distinction: **incorrect** may signal a misconception the Blueprint should address; **I don’t know** and **skip** signal absence of evidence. Neither is “worse” for scoping.
- Do not display a guessing-corrected percent.

---

## 5. Starting Level representation and mapping

### 5.1 What the Blueprint needs

Locked mapping: the Generator is told subject, Learning Goal, and Starting Level, and designs Module/Lesson sequence for that remaining gap alone. There is no canonical novice→goal outline and no unpublished prefix. Starting Level is not a per-Lesson difficulty score.

NRC and ECD both prefer a student model at a grain size that matches the decision. The decision here is *what to include in the remaining-gap Blueprint*, not *where the Learner sits on a continuous trait*. Hailikari/Dochy argue for a **profile** of prior-knowledge components rather than a single amount. Falmagne et al. also prefer lists (“can do” / “ready to learn”) over a crude numerical mark—but they require a constructed space we do not have. The prototype takes the *list* idea and drops the combinatorial state family.

### 5.2 Recommended structure (not a 0–100)

**Recommend: evidenced vs not-evidenced prerequisite capabilities + a remaining-gap statement + honesty/coverage note.** Reject a 0–100 Starting Level: Learners will confuse it with Progress (already 0–100 remaining-gap through the *approved Course*), and eight uncalibrated items cannot support that precision (AERA SEM; Spearman–Brown: shortening a test lowers reliability). Coarse bands (novice/intermediate/advanced) as the *only* object are also rejected: they throw away which capabilities were evidenced and invite fake precision plus self-schema labels.

Sketch the Blueprint input as:

```ts
type EvidenceStatus =
  | "correct"
  | "incorrect"
  | "dont_know"
  | "skipped";

type ProbedCapability = {
  id: string;
  statement: string; // e.g. "State the role of iodine as mordant in Gram staining"
  itemId: string;
  status: EvidenceStatus;
};

type StartingLevel = {
  learningGoal: string;
  probedCapabilities: ProbedCapability[];
  remainingGapStatement: string; // short, Learner-facing
  coverageNote: string; // honesty: what was not measured
  extremity:
    | "floor"              // little or no evidenced capability
    | "mixed"
    | "ceiling"            // all or nearly all correct
    | "insufficient_evidence"; // generation failed, or all skipped
};
```

No `percentCorrect`, no `proficiency0to100`, no write to Progress.

### 5.3 Mapping rules (coarse, honest)

1. **Evidenced** iff `correct`. Only those capabilities may be treated as already in place when scoping the remaining-gap.
2. **Not evidenced** iff `incorrect` | `dont_know` | `skipped`. Include instruction covering that capability (or an equivalent) in the remaining-gap unless the Learner later confirms a capability-level override.
3. **Do not assume a validated hierarchy.** If a near-goal item is correct and a fundamental is not, record a mixed profile. Include the missed fundamental. Do not infer that the near-goal item “proves” the fundamental (White/Gagné: hierarchies are empirical claims, not generator output).
4. **Floor:** zero or one correct, or all I don’t know/skip → `extremity = "floor"`. Remaining-gap runs from fundamentals to the Learning Goal. Require confirmation of the remaining-gap statement.
5. **Ceiling:** all correct (or all but one) → `extremity = "ceiling"`. Remaining-gap may be thin. Honesty copy must say the check cannot certify that the Learner already meets the Learning Goal (especially for performance goals). Blueprint still proposes *some* path to the stated goal (practice-in-words, remaining nuances) or the Learner revises the Learning Goal; do not publish an empty Course silently.
6. **Insufficient evidence:** see §8. Do not invent Progress. Do not invent a percent.
7. **Scaffolding dosage** (expertise reversal): floor/mixed-with-many-misses → more worked examples and tighter prerequisite sequencing in the Blueprint. Ceiling/many-correct → less redundant guidance. This is Starting Level, not Teaching Profile.

### 5.4 Learner-facing honesty copy (Course Guide may show)

Intro before items:

> This is a short check of knowledge related to your Learning Goal so we can start the Course in the right place. It is not a Quiz, not a grade, and not a test of intelligence. If you are not reasonably sure, choose **I don’t know**. You will review the Course Blueprint before anything is generated.

After scoring (show the remaining-gap statement, **not** a 0–100):

> Based on this check, we would start you here: *[remaining-gap statement]*. This is a small sample, not a certificate that you can already do the full goal in the real world. *[coverageNote, e.g. “We did not test lab technique / kit playing.”]* Quizzes later in the Course do not change this starting point.

Optional confirmation (scope, not self-scoring):

- **Looks right** — proceed to Blueprint generation.
- **This would be too easy** — treat additional fundamentals as not evidenced (expand remaining-gap). Defensible: it is conservative and does not claim extra mastery.
- **Treat a specific capability as already in place** — optional, warned, capability-level only. Do **not** offer a global “I’m actually advanced” slider. If product omits this third option, that is consistent with Kruger–Dunning; see §10.

---

## 6. Construct-irrelevant variance for the three Test courses

Messick’s two threats: the assessment is too narrow (underrepresentation) or too broad/contaminated (irrelevant variance). Miller’s pyramid separates **knows** / **knows how** (written) from **shows how** / **does** (performance in simulation or practice). A verbal MCQ can evidence the base of that pyramid. It cannot evidence the top. Downing: flawed or off-construct items are themselves a CIV source.

### 6.1 Microbiology lab fundamentals

**May ask:** reagent order and purpose in Gram staining (crystal violet, iodine, decolorizer, safranin); peptidoglycan / Gram-positive vs Gram-negative as *written* distinctions; why oil immersion is used; what “aseptic” means vs “sterile”; colony vs cell; why a smear is heat-fixed—in words.

**Must not ask or claim:** that the Learner can perform a Gram stain, flame a loop, focus a real microscope, or plate without contamination. Photomicrograph identification is only in-bounds if a real, licensed image is shown; generated photomicrographs are already forbidden as Demonstrative media and would be CIV plus hallucination risk as diagnostic stems.

**Honesty:** “This check covers lab *knowledge*. It cannot tell us whether you can perform sterile technique.”

### 6.2 Drum kit fundamentals (terminal goal: play “Iris” as transferable 4/4–6/8 skills)

**May ask:** time-signature identification (4/4 vs 6/8) from a written bar; where a backbeat typically falls; names of kit pieces; note values; conceptual mapping of “Iris” to transferable skills (feel, subdivision), without reproducing a chart or audio.

**Must not ask or claim:** playing, tapping, timing, coordination, or listening tests of generated or copyrighted audio. No generated Iris chart. The platform never assesses playing—diagnostic included.

**Honesty:** “This check covers drumming *theory* related to your goal. It cannot tell us whether you can play.”

### 6.3 Norse mythology (mythic corpus only)

**May ask:** attested corpus distinctions (e.g. Aesir/Vanir as presented in the eddic/Snorri tradition), cosmography, named figures and their corpus roles, source-awareness at a coarse level (poem vs prose tradition) if the stem stays inside the stated corpus.

**Must not ask or claim:** living religious competence, ritual performance, or treating modern retellings as the corpus without labeling them as such.

**Honesty:** “This check covers facts and relations in the mythic corpus you named. It is not a test of belief or of every text in the tradition.”

Across all three: stems in English; instructional language is not read from the Profile for the diagnostic UI (app is English). Do not let reading-load or trick wording become the construct (Haladyna 8, 16–17; AERA CIV from language).

---

## 7. Teaching Profile combination, flow, and expertise reversal

### 7.1 Orthogonal combination

Locked: Teaching Profile does not diagnose ability and does not update Starting Level. Starting Level does not update Profile. Sequence mode is Course-level. `instructionLanguage` is consumed by reading/Quiz generation only; Assessment chrome stays English.

Kalyuga, Ayres, Chandler, and Sweller (2003): instructional techniques that help inexperienced learners (heavy guidance, worked examples) can lose benefit or reverse with expertise, because redundant guidance competes with existing schemas in working memory. That interaction is **expertise × guidance amount**. It is not a preference-by-method meshing hypothesis and it is not a Profile field.

| Input | Owns | Must not own |
| --- | --- | --- |
| Starting Level | Remaining-gap scope; *amount* of scaffolding / worked-example dosage | Profile fields; Progress; Sequence mode |
| Teaching Profile | Presentation/preference fields (SEN-24); `explanationOrder` = order only | Starting Level; dosage of guidance; ability claims |
| Validity gate | Pass / one clarification / reject | Assessment policy; Blueprint |

Never infer “this Learner prefers examples first, therefore they are a novice” or “they missed three items, therefore they need plain language.” Needs in the Profile are declared; capability is assessed.

### 7.2 Flow (Course Guide presents; does not own)

1. Learner forms Course Request (subject + Learning Goal).
2. **Validity gate** (hybrid). Assessment does not re-run validity. Course Guide cannot override.
3. **Teaching Profile** if and only if none exists **or** the Learner explicitly chose reassessment on this Request. Edit prefills; reassess does not (SEN-24). Standalone edit/reassess outside a Request does not run a Starting Level diagnostic.
4. **Starting Level diagnostic** on **every** Course Request (eight items).
5. **Optional confirmation** of the remaining-gap statement (§5.4).
6. Blueprint generation from subject + Learning Goal + Starting Level + applicable Profile fields that the Blueprint actually consumes (e.g. `quizCadence`).
7. Learner Blueprint review → full Course generation → atomic publish.

First Course: steps 3 and 4 both run. Later Courses: skip 3 unless explicit reassess; always run 4. Profile changes do not silently restructure approved Courses.

### 7.3 Diagnostic vs in-Course Quiz (do not conflate)

| | Starting Level diagnostic | Quiz Lesson |
| --- | --- | --- |
| When | After Validity, before Blueprint | After the instructional Lessons it assesses |
| Purpose | Scope remaining-gap | Retrieval practice + Progress gate |
| Format | 8 × (3 options + I don’t know) | 5–10 × 4-option MCQ, no I don’t know required |
| Completion | None; not a Lesson | Best ≥70%; unlimited same-item retakes |
| Progress | Never | Completing the Quiz counts |
| Retake as mastery | No | Yes, same items |
| Reuse | Items never become Course Quizzes | Never copied from another Course |
| Starting Level | Sets it once for this Course | Must not re-estimate it |

---

## 8. Failure modes (no invented Progress)

| Situation | What the Course Request does |
| --- | --- |
| Diagnostic generation fails | Retry once with the fallback model. If still failing, set Request status to assessment-failed (or equivalent). Offer **Retry diagnostic**. Do not invent a Starting Level from self-report. Do not write Progress. |
| Learner skips all items or all I don’t know | `insufficient_evidence` or `floor`. Remaining-gap from fundamentals to goal. Require confirmation. Honesty: “We did not get evidence of prior knowledge, so we would start from the fundamentals.” |
| Obvious floor (0–1 correct) | As above, `floor`, confirmation required. |
| Obvious ceiling (all correct) | `ceiling`. Remaining-gap statement must not say “you have already reached the Learning Goal” unless the goal is itself a knowledge-only corpus goal *and* the items actually sampled it. For drums/micro, never. Offer proceed to a thin Blueprint **or** revise Learning Goal. |
| Mixed / hierarchy clash | Record mixed; include missed fundamentals; do not average into a fake band. |
| Bounded fact-check kills a key | Regenerate that item; do not teach from the bad key. |
| Learner abandons mid-diagnostic | Persist partial responses; do not Blueprint until the set is complete or they confirm floor-from-insufficient-evidence. |

Mid-Course re-estimation remains out of scope. Quizzes do not patch a bad Starting Level.

---

## 9. Non-claims (prototype must not overclaim)

The prototype must **not** claim or display:

- certified or licensed placement, promotion, or credentialing;
- an IRT/CAT/ALEKS (or “adaptive knowledge space”) measurement;
- a 0–100 Starting Level or any number Learners could confuse with Progress;
- IQ, aptitude, disability, or clinical diagnosis;
- a learning style, VARK type, or “visual/kinesthetic Learner”;
- that matching Teaching Profile preferences raises achievement;
- wet-lab technique, sterile performance, or microscopy skill;
- drum-kit playing, timing, or coordination;
- that the Learner has (or has not) fully attained the Learning Goal on the basis of eight items;
- that in-Course Quiz scores updated Starting Level;
- that skipped items were “failed Lessons” or that diagnostic percent-correct is Progress.

It **may** truthfully say: “We used a short knowledge check to decide where this Course should start. You can review the Blueprint before we generate it.”

---

## 10. Risks and genuine remaining product choices

### 10.1 Risks to carry into the specification

- **False precision.** Eight items are a sample. Remaining-gap statements must stay qualitative.
- **Generator drift.** Without the §4.3 checks, LLM items will cue the key, use implausible distractors, or test trivia (Haladyna; Tarrant; Law et al.; Wu).
- **Guessing still exists.** I don’t know reduces but does not remove it; do not interpret one lucky correct as durable mastery.
- **Self-upgrade.** A prominent “this is too hard / I’m more advanced” control re-closes the ticket toward self-report-only of mastery.
- **CIV by English.** Assessment is English because the app is English; do not interpret misses as low Starting Level when the issue is instructional-language need (that belongs in the Profile, and v1 is English-only anyway).
- **Empty ceiling Courses.** A knowledge-only Norse goal plus eight/eight correct could yield a too-thin Blueprint; force Learner review rather than auto-publish.

### 10.2 Prototype locks for the two leftover UX choices

Evidence does not uniquely pick these screens, but it does forbid silent self-report substitution and self-upgraded mastery. This resolution therefore locks the conservative defaults:

1. **Failed generation after retry.** After one fallback-model retry, the Course Request is **assessment-failed**. Offer **Retry diagnostic** only. Do not invent a Starting Level from self-report, and do not offer a “Start from fundamentals” shortcut that looks like a completed diagnostic.
2. **No capability-level “treat as already evidenced” override.** After the remaining-gap statement, the Learner may confirm it or mark the Course **too easy** (expand the remaining-gap). Blueprint review remains the place to drop irrelevant Lessons. A global or per-capability “I’m more advanced” control is out of this prototype.

---

## 11. Sources

Claims use original standards, monographs, and journal articles. Vendor marketing and secondary blogs were not used as evidence.

### Validity, reliability, and placement interpretations

- AERA, APA, & NCME (2014), *Standards for Educational and Psychological Testing* (validity = evidence for interpretations and uses, not “the test”; construct underrepresentation and construct-irrelevant variance; reliability/SEM; shortening a test lowers precision; placement benefits need evidence; do not use a single score as the sole placement indicator): http://www.testingstandards.net/uploads/7/6/6/4/76643089/standards%5F2014edition.pdf
- Kane, M. T. (2013), *Validating the Interpretations and Uses of Test Scores* (argument-based validation; more ambitious claims need more support): https://doi.org/10.1111/jedm.12000
- Messick, S. (1995), *Validity of psychological assessment* (inferences from responses; construct underrepresentation vs construct-irrelevant variance): https://doi.org/10.1037/0003-066X.50.9.741
- Messick, S. (1994), *The Interplay of Evidence and Consequences in the Validation of Performance Assessments*: https://doi.org/10.3102/0013189X023002013
- Spearman, C. (1910), *Correlation calculated from faulty data* (reliability and test length; Spearman–Brown): https://doi.org/10.1111/j.2044-8295.1910.tb00206.x
- Brown, W. (1910), *Some experimental results in the correlation of mental abilities*: https://doi.org/10.1111/j.2044-8295.1910.tb00207.x

### Self-assessment vs performance; prior knowledge

- Sitzmann, T., Ely, K., Brown, K. G., & Bauer, K. N. (2010), *Self-Assessment of Knowledge: A Cognitive Learning or Affective Measure?* (cognitive learning *ρ* = .34 vs motivation *ρ* = .59 and reactions *ρ* = .51; 32% of studies treated self-assessment as learning): https://doi.org/10.5465/amle.9.2.zqr169
- Kruger, J., & Dunning, D. (1999), *Unskilled and unaware of it* (bottom quartile ~12th percentile, self-estimate ~62nd): https://doi.org/10.1037/0022-3514.77.6.1121
- Falchikov, N., & Boud, D. (1989), *Student Self-Assessment in Higher Education: A Meta-Analysis*: https://doi.org/10.3102/00346543059004395
- Boud, D., & Falchikov, N. (1989), *Quantitative studies of student self-assessment in higher education: a critical analysis of findings*: https://doi.org/10.1007/BF00138746
- Dochy, F., Segers, M., & Buehl, M. M. (1999), *The relation between assessment practices and outcomes of studies: The case of research on prior knowledge*: https://doi.org/10.3102/00346543069002145
- Hailikari, T., Katajavuori, N., & Lindblom-Ylänne, S. (2008), *The Relevance of Prior Knowledge in Learning and Instructional Design*: https://doi.org/10.5688/aj7205113
- Hailikari, T., Nevgi, A., & Lindblom-Ylänne, S. (2007), *Exploring alternative ways of assessing prior knowledge…*: https://doi.org/10.1016/j.stueduc.2007.07.007
- Dochy, F. J. R. C., De Rijdt, C., & Dyck, W. (2002), *Cognitive Prerequisites and Learning*: https://doi.org/10.1177/1469787402003003006

### IRT, CAT, knowledge spaces (rejected-for-prototype)

- Lord, F. M. (1980), *Applications of Item Response Theory to Practical Testing Problems* (item parameters, item banking, tailored testing): https://doi.org/10.4324/9780203056615
- Wainer, H., Dorans, N. J., Flaugher, R., Green, B. F., Mislevy, R. J., Steinberg, L., & Thissen, D. (2000), *Computerized Adaptive Testing: A Primer* (2nd ed.) (calibrated pool, selection, stopping): https://doi.org/10.4324/9781410605931
- Reckase, M. D. (2010), *Designing item pools to optimize the functioning of a computerized adaptive test* (CAT attractive properties only if appropriate calibrated items are available): https://ptam-journal.com/wp-content/uploads/2025/01/01_Reckase.pdf
- Doignon, J.-P., & Falmagne, J.-C. (1985), *Spaces for the assessment of knowledge*: https://doi.org/10.1016/S0020-7373(85)80031-6
- Falmagne, J.-C., Cosyn, E., Doignon, J.-P., & Thiéry, N. (2006), *The Assessment of Knowledge, in Theory and in Practice*: https://doi.org/10.1007/11671404_4
- Doignon, J.-P., & Falmagne, J.-C. (2015), *Knowledge Spaces and Learning Spaces* (constructions “enormously demanding”; huge assessment data): https://arxiv.org/abs/1511.06757

### Evidence-centered design and the assessment triangle

- Mislevy, R. J., Almond, R. G., & Lukas, J. F. (2003/2004), *A Brief Introduction to Evidence-Centered Design* (CSE Report 632 / ETS RR): https://files.eric.ed.gov/fulltext/ED483399.pdf and https://doi.org/10.1002/j.2333-8504.2003.tb01908.x
- Mislevy, R. J., Steinberg, L. S., & Almond, R. G. (2003), *On the Structure of Educational Assessments*: https://doi.org/10.1207/S15366359MEA0101_02
- National Research Council (2001), *Knowing What Students Know: The Science and Design of Educational Assessment* (assessment triangle; reasoning from incomplete evidence; one assessment, many purposes): https://doi.org/10.17226/10019

### Item writing, guessing, LLM-generated MCQs

- Haladyna, T. M., Downing, S. M., & Rodriguez, M. C. (2002), *A Review of Multiple-Choice Item-Writing Guidelines for Classroom Assessment* (31 guidelines): https://doi.org/10.1207/S15324818AME1503_5
- Rodriguez, M. C. (2005), *Three Options Are Optimal for Multiple-Choice Items: A Meta-Analysis of 80 Years of Research*: https://doi.org/10.1111/j.1745-3992.2005.00006.x
- Tarrant, M., Knierim, A., Hayes, S. K., & Ware, J. (2006), *The frequency of item writing flaws in multiple-choice questions used in high stakes nursing assessments* (46.2% flawed): https://doi.org/10.1016/j.nedt.2006.07.006
- Downing, S. M. (2002), *Construct-irrelevant Variance and Flawed Test Questions*: https://doi.org/10.1097/00001888-200210001-00032
- Downing, S. M. (2005), *The Effects of Violating Standard Item Writing Principles on Tests and Students*: https://doi.org/10.1007/s10459-004-4019-5
- Muijtjens, A. M. M., van Mameren, H., Hoogenboom, R. J. I., Evers, J. L. H., & van der Vleuten, C. P. M. (1999), *The effect of a ‘don’t know’ option on test scores*: https://doi.org/10.1046/j.1365-2923.1999.00292.x
- Sanderson, P. H. (1973), *The ‘don’t know’ option in MCQ examinations*: https://doi.org/10.1111/j.1365-2923.1973.tb02206.x
- Sanderson, P. H. (1976), *Multiple choice questions: to guess or not to guess*: https://doi.org/10.1111/j.1365-2923.1976.tb00527.x
- Ravesloot, C. J., Van der Schaaf, M. F., Muijtjens, A. M. M., Haaring, C., Kruitwagen, C. L. J. J., Beek, F. J. A., … Ten Cate, Th. J. (2015), *The don’t know option in progress testing*: https://doi.org/10.1007/s10459-015-9604-2
- Moore, S., Nguyen, H. A., Chen, T., & Stamper, J. (2023), *Assessing the Quality of Multiple-Choice Questions Using GPT-4 and Rule-Based Methods* (rule-based IWF detection 91% vs GPT-4 79%): https://doi.org/10.48550/arXiv.2307.08161
- Law, A. K.-K., So, J. L. T., Lui, C. T., Choi, Y. F., Cheung, K. H., Hung, K. K. C., & Graham, C. A. (2025), *AI versus human-generated multiple-choice questions for medical education: a cohort study in a high-stakes examination*: https://doi.org/10.1186/s12909-025-06796-6
- Kaya, M., Sönmez, E., Halıcı, A., Yıldırım, H., & Çoşkun, A. (2025), *Comparison of AI-generated and clinician-designed multiple-choice questions in emergency medicine exam: a psychometric analysis*: https://doi.org/10.1186/s12909-025-07528-6
- Wu, H., Lee, D., Zerner, T., Court-Kowalski, S., Devitt, P., & Palmer, E. (2026), *A comparison of the psychometric properties of GPT-4 versus human novice and expert authors of clinically complex MCQs…*: https://doi.org/10.1080/0142159X.2025.2513418

### Goal decomposition, expertise reversal, performance vs knowledge

- Gagné, R. M. (1962), *The acquisition of knowledge* (learning hierarchies; “what would the individual already have to know…”): https://doi.org/10.1037/h0042650
- Gagné, R. M. (1968), *Learning hierarchies*: https://doi.org/10.1080/00461526809528968
- White, R. T. (1973), *Research into Learning Hierarchies* (validation not automatic; mostly maths/science; often inconclusive): https://doi.org/10.3102/00346543043003361
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003), *The Expertise Reversal Effect*: https://doi.org/10.1207/S15326985EP3801_4
- Miller, G. E. (1990), *The assessment of clinical skills/competence/performance* (knows / knows how / shows how / does): https://doi.org/10.1097/00001888-199009000-00045

---

*End of research note.*
