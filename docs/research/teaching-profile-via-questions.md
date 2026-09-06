# Teaching Profile via questions

**Date:** 2026-08-23

What are the best evidence-backed ways to assess a Learner's Teaching Profile using questions—which questions or instruments can inform teaching-method configuration, what can they claim, and what should a short prototype questionnaire do for reading Lessons and Quiz Lessons while remaining extensible to later plugins? The Teaching Profile is Learner-level, reused until explicit reassessment, and is not the course-specific Starting Level.

---

## 2. Recommendation

**Use a short, direct configuration questionnaire, not a learning-styles inventory and not a psychometric “type” score.** Ask separately about (a) functional needs that must be honored, such as instructional language and reading presentation requirements, and (b) current preferences for concrete, changeable features: reading-Lesson scope, section pacing, example order, Quiz cadence, and feedback timing/detail. Every preference item should offer **“No preference—use the default”** and every item should be skippable. Store independent semantic fields with provenance (`declared_need`, `stated_preference`, or `evidence_default`); do not add the answers into a composite score or assign a Learner type.

This is the defensible interpretation: the questionnaire records what the Learner says is required or preferred and configures matching product features. It does **not** establish which method will make that Learner learn more. In particular, visual/auditory/read-write/kinesthetic classifications and the “meshing” claim that matching instruction to such a type improves outcomes are not supported well enough for product use. Preferences can be respected for usability, agency, and persistence without being presented as causal learning prescriptions.

For the prototype, use the eight questions in §5. Recommended defaults when the Learner has no preference are:

- reading Lessons cover a few connected ideas, use clear semantic sections, and remain continuously scrollable;
- the Generator chooses topic-appropriate explanation order, usually using a concrete example when one is natural;
- place one short Quiz after every two to three reading Lessons;
- reveal corrective feedback after each response, with the correct answer and a concise explanation;
- keep Course **Sequence mode** separate and Course-level; it is not a Teaching Profile field.

These defaults are informed by retrieval-practice, formative-feedback, segmentation, and worked-example research, but the evidence does not validate the exact prototype intervals or prove that preference-matching improves learning.

### 2.1 Decision text for the Linear resolution comment

> Resolve with a direct, editable Teaching Profile questionnaire—not VARK, learning-style labels, or a composite score. Store declared functional needs separately from changeable feature preferences. For v1, ask about instructional language/reading requirements, reading-Lesson scope and pacing, example order, Quiz cadence, and feedback timing/detail; map each answer directly to reading or Quiz behavior, with “no preference” and skip states falling back to evidence-informed defaults. Default to semantically chunked reading, one short Quiz after every 2–3 reading Lessons, and immediate concise corrective feedback. Do not claim the questionnaire diagnoses ability/disability, predicts the best method, or that matching a “learning style” improves outcomes. Keep Starting Level course-specific and Sequence mode Course-level. Reassessment is explicit and editable; later plugins consume only semantic fields they support, not a Learner type.

---

## 3. What questions and instruments can actually support

### 3.1 The useful distinction is needs versus preferences, not types

Three kinds of information are often mixed together:

1. **Declared functional needs or constraints.** Examples: the language in which the Learner can use the content, or a requirement for short paragraphs and inline definitions. These are direct statements about product usability. They should be honored where supported, not converted into an ability estimate or disability diagnosis.
2. **Current feature preferences.** Examples: seeing feedback after each question or after submitting the Quiz. These can improve fit with the experience the Learner wants, but may change by subject, goal, context, or experience.
3. **Course-specific capability.** Prior knowledge and current capability relative to a Learning Goal can affect useful guidance and worked-example dosage, but that is **Starting Level** and belongs to the separate course-specific assessment.

The 1EdTech AccessForAll Personal Needs and Preferences specification provides a useful model for the first category: record how a person needs or prefers to interact with a digital resource, not private medical history. It is an interoperability model, not evidence that a preference raises achievement. W3C cognitive-accessibility guidance similarly supports adaptable, readable, user-controlled content and preference-driven personalization. Accessibility fundamentals—semantic structure, assistive-technology compatibility, keyboard operation, sufficient time, and readable/predictable UI—must remain product baselines rather than benefits available only to people who disclose a need.

### 3.2 Instrument options

| Approach | What it was designed to measure | Fit for this ticket |
| --- | --- | --- |
| VAK/VARK, Dunn-style, or similar learning-style inventory | A claimed modality/style preference or category | **Reject.** A preference can be real, but the category does not establish an instruction-by-type crossover that warrants matching teaching methods. It also encourages fixed labels. |
| MSLQ (Motivated Strategies for Learning Questionnaire) | 81-item self-report of college students' motivation and learning strategies **for a specific course** | **Do not use as the Learner-level Teaching Profile.** It is too long, course-specific by design, and does not directly select reading versus Quiz behavior. Selected constructs could inform separate research later, but reusing its name or score would exceed its intended use. |
| AccessForAll Personal Needs and Preferences | Machine-readable functional needs/preferences for digital learning access | **Borrow the data-model principle, not a score.** It explicitly avoids medical history and models needs/preferences independently. |
| Short direct feature-choice questionnaire | The Learner's stated requirements and choices for implemented product behavior | **Use for v1.** Each answer has a visible, reversible consequence. It is a configuration form, not a validated aptitude or personality test. |

The *Standards for Educational and Psychological Testing* define validity in relation to the interpretation and proposed use of a score, not as an inherent property of a questionnaire. The proposed use here can be narrow and supportable: “this answer configures this feature.” The stronger interpretation—“this score identifies the method that causes the Learner to achieve more”—has no validation evidence.

### 3.3 Learning styles and the meshing hypothesis

Pashler et al. specified the necessary test: classify styles, randomly assign people within each style to different instructional methods, use a common outcome, and observe a crossover interaction in which each style group performs best under a different method. Their review found virtually no qualifying evidence for that pattern. Rogowsky et al. subsequently tested reading versus audiobook instruction in adults and found no preference-by-method effect on immediate or delayed comprehension; a school-age replication likewise found no benefit from matching visual/auditory preference to presentation.

The literature still requires nuance. A 2024 meta-analysis reported a small aggregate advantage for “matched” conditions (`g = 0.31`), but only 26% of outcomes showed the crossover pattern needed to support matching, study quality was low, and the authors concluded the benefit was too small and infrequent for widespread adoption. A 2025 synthesis separating true matching tests from correlational “styles/preferences/strategies” studies estimated the actual matching effect at `d = 0.04`. The practical conclusion is unchanged: do not spend prototype complexity assigning or matching types.

**The product must not:**

- call someone a visual, auditory, reading, Quiz, active, reflective, or kinesthetic “Learner type”;
- infer that a selected preference is an aptitude, stable trait, disability, reading level, attention capacity, or intelligence;
- claim that matching presentation to a preference improves comprehension, retention, Progress, or Learning Goal attainment;
- withhold a generally effective method—for example retrieval practice—because a style label says it is a “mismatch”;
- infer Starting Level from Teaching Profile answers;
- report a numerical “Teaching Profile score” as if higher were better or more certain.

It may truthfully say: “We will start with the lesson settings you selected. You can change them later.”

---

## 4. Which adaptations are defensible

| Adaptation | Evidence-backed default | What a questionnaire may change | Limit on the claim |
| --- | --- | --- | --- |
| **Quiz frequency** | Retrieval practice outperforms restudy on average; classroom meta-analysis also supports regular quizzing (Roediger & Karpicke, 2006; Adesope et al., 2017; Yang et al., 2021). Use short, repeated Quiz opportunities with corrective feedback. For this product, start with one Quiz after 2–3 reading Lessons. | Let the Learner request a Quiz after each reading Lesson, after 2–3, or at Module end. | Research supports testing versus less/no testing more clearly than any exact cadence. It especially supports low-stakes practice; this product's 70%-to-complete Quiz is a Progress gate even with unlimited retakes, so do not call the exact cadence experimentally proven. |
| **Feedback timing** | Give corrective feedback promptly; immediate feedback is commonly stronger in applied classroom studies (Kulik & Kulik, 1988). Default to feedback after each answer. | Permit feedback after each answer or after the whole Quiz. | Timing findings vary by task and study setting; Butler et al. (2007) found a delayed-feedback advantage in their laboratory design. A preference is not evidence of a person-specific optimum. |
| **Feedback detail** | Always provide correctness, the correct answer, and a concise task-focused explanation (Shute, 2008). | Offer brief, standard, or detailed explanation. | More text is not automatically better. Feedback should be specific and actionable, not praise/person judgment; detail selection is a usability choice, not a diagnosis. |
| **Chunk size** | Organize content into meaningful, coherent sections (Rey et al., 2019). | Let the Learner choose one key idea, a few connected ideas, or an extended reading Lesson. | Segmenting has small-to-medium benefits in multimedia research; the transfer to ordinary self-paced prose and the exact ideal length are not established. Do not infer reading ability from the choice. |
| **Pacing** | Reading already permits learner pacing through scrolling. Keep clear sections and never auto-advance to the next Lesson. | Offer continuous sections or a “Continue” pause between sections. | Learner-paced segmentation evidence is strongest for fast/complex multimedia. In text, this is primarily accessibility and interaction preference. |
| **Examples before theory** | Use correct worked/concrete examples when appropriate; worked examples have substantial support, especially for novices in structured domains (Sweller & Cooper, 1985; Barbieri et al., 2023). | Let the Learner prefer example-then-explanation or explanation-then-example. | Worked-example evidence is not evidence that “example-first” is universally superior in every subject. Expertise can reverse useful guidance (Kalyuga et al., 2003); expertise belongs to course-specific Starting Level, not this Profile. |
| **Learner control** | Provide usable controls and a sound suggested route. | Section-level pacing may be a Profile preference. **Course Sequence mode remains its existing explicit Course-level choice.** | Karich et al. (2014) found near-zero overall academic benefit from learner control in educational technology (`g = 0.05`). Offer control for agency/access, not as a proven achievement intervention. |

Two default/preference rules follow:

1. **Do not preference-test a universal baseline.** Corrective feedback, semantic structure, accessibility, and adequate time should be present regardless of answers.
2. **Do not turn an evidence-backed average into a type.** Retrieval practice can be a good default for everyone while cadence/detail remain adjustable.

---

## 5. Prototype questionnaire

### 5.1 Intro shown to the Learner

> These choices set up how your Lessons are presented. They are not a test of intelligence, ability, or disability. You can skip any question and change these choices later.

Questions 1–2 are declared needs/constraints. Questions 3–8 are current preferences. Keep “None” and “Prefer not to answer” distinct for needs, and keep “No preference” distinct from skip for preferences.

### 5.2 Exact questions and response options

**Q1 — Instructional language (single select)**

> Which language should reading Lessons, Quiz questions, and Quiz feedback use?

- Use my current app language
- `<each language the prototype actually supports>`
- I need a language that is not listed
- Prefer not to answer

Consequence: set `instructionLanguage`. If an explicitly required language is unsupported, disclose that before Course generation; do not silently substitute another language or infer language proficiency.

**Q2 — Reading requirements (multi-select)**

> Do any of these need to be true for reading Lessons to be usable for you? Select all that apply.

- Use plain, direct wording
- Use short paragraphs with clear headings
- Define unfamiliar terms where they first appear
- None of these
- Prefer not to answer

`None` and `Prefer not to answer` are mutually exclusive with the other choices. Consequence: set independent `requiredReadingSupports` flags. These tighten presentation/generation rules; they do not alter Starting Level. Do not ask for a diagnosis or for the name of assistive technology. No time limit, screen-reader compatibility, and text-to-speech compatibility are baselines, not disclosed preferences.

**Q3 — Reading-Lesson scope (single select)**

> How much content should one reading Lesson usually cover?

- Compact — one key idea
- Standard — a few connected ideas
- Extended — a fuller treatment with fewer Lesson breaks
- No preference — use the default
- Prefer not to answer

Consequence: set `contentScope = compact | standard | extended`. The reading plugin changes conceptual scope, not a fixed word count; word count is a poor proxy because subjects, languages, and reading rates differ. Default: `standard`.

**Q4 — Section pacing (single select)**

> How should sections inside a reading Lesson advance?

- Pause after each section until I choose **Continue**
- Keep the Lesson continuous so I can scroll at my own pace
- No preference — use the default
- Prefer not to answer

Consequence: set `sectionAdvance = manual | continuous`. Default: `continuous`, with semantic headings and no automatic jump to the next Lesson.

**Q5 — Example order (single select)**

> When a new idea has a useful example, which order would you like?

- Show a concrete or worked example, then explain it
- Explain the idea, then show a concrete or worked example
- No preference — use the best order for the topic
- Prefer not to answer

Consequence: set `explanationOrder = example_first | principle_first`; no preference leaves the Generator topic-aware. This changes order, not the amount of guidance implied by Starting Level.

**Q6 — Quiz cadence (single select)**

> How much reading would you like between short Quiz Lessons?

- A Quiz after every reading Lesson
- A Quiz after every 2–3 reading Lessons
- A Quiz at the end of each Module
- No preference — use the default
- Prefer not to answer

Consequence: set `quizCadence = every_reading | every_2_to_3_readings | module_end`. The Course Blueprint uses the chosen interval while still placing each Quiz after the instructional Lessons it assesses. Default: `every_2_to_3_readings`.

**Q7 — Feedback timing (single select)**

> When should a Quiz show the answer and explanation?

- After each question
- After I submit the whole Quiz
- No preference — use the default
- Prefer not to answer

Consequence: set `feedbackTiming = per_item | end_of_quiz`. The Learner must answer before feedback appears. Default: `per_item`.

**Q8 — Feedback detail (single select)**

> How much feedback should each Quiz answer include?

- Brief — the correct answer and a one-sentence reason
- Standard — a concise explanation, including why another choice is wrong when useful
- Detailed — a fuller explanation with an example or retry hint
- No preference — use the default
- Prefer not to answer

Consequence: set `feedbackDepth = brief | standard | detailed`. All three include corrective information; the preference changes depth, not whether feedback exists. Default: `standard`.

### 5.3 Why there is no “reading Learner versus Quiz Learner” question

A forced choice such as “Do you learn best by reading or by quizzes?” asks the Learner to make an unvalidated causal judgment and encourages a type label. Q6 asks the actionable question instead: how frequently the two currently implemented Lesson methods should alternate. The Course may still use both because reading supplies instruction and retrieval practice supports retention.

---

## 6. Scoring, derived fields, and plugin contract

### 6.1 No aggregate score

“Scoring” is field resolution, not points. Preserve the response state:

```ts
type ProfileAnswer<T> =
  | { status: "selected"; value: T }
  | { status: "no_preference" }
  | { status: "skipped" };

type DeclaredNeed<T> =
  | { status: "declared"; value: T }
  | { status: "none_declared" }
  | { status: "skipped" };
```

Resolve each setting independently:

1. A supported declared functional need is mandatory.
2. A stated feature preference selects that feature behavior.
3. `no_preference` or `skipped` uses the evidence-informed product default.
4. Record provenance on the resolved value; do not convert missing answers into inferred preferences.

```ts
type ResolvedSetting<T> = {
  value: T;
  source: "declared_need" | "stated_preference" | "evidence_default";
};
```

Internal consistency (for example, Cronbach's alpha) is not meaningful for this form: the items intentionally measure different settings and should not correlate. Test–retest stability is also not a target for preferences that are explicitly allowed to change. Reliability here means that the same saved answer resolves to the same product behavior and that translations preserve item meaning.

### 6.2 Prototype consequences by plugin

| Semantic field | Reading plugin | Quiz plugin / Course Blueprint |
| --- | --- | --- |
| `instructionLanguage` | Generate reading content in supported language | Generate questions and feedback in the same supported language |
| `requiredReadingSupports[]` | Apply plain-language, paragraph/heading, and inline-definition requirements | Use the relevant language/clarity requirements in prompts and UI; do not lower assessed objective |
| `contentScope` | Change conceptual scope per reading Lesson | Indirectly changes how many reading Lessons occur between Quiz placements |
| `sectionAdvance` | Render paged/manual sections or continuous scroll | Ignored |
| `explanationOrder` | Order examples and explanation when both are appropriate | May order a worked feedback example, but must not change question difficulty |
| `quizCadence` | Ignored by the Lesson renderer | Blueprint places Quiz Lessons at selected interval |
| `feedbackTiming` | Ignored | Reveal feedback per item or at Quiz submission |
| `feedbackDepth` | Ignored | Generate/render brief, standard, or detailed corrective feedback |

No field is named after a current plugin or a Learner type. Future plugins declare which semantic settings they consume, receive only those fields, and ignore the rest. For example, a future simulation plugin could consume `sectionAdvance` and `feedbackDepth`; an audio plugin could add a new directly stated need such as captions/transcript without changing old profiles. Do not make plugins branch on a global value like `profileType = "quiz_learner"`.

Version the questionnaire and schema (`teachingProfileVersion = 1`). New plugin-specific questions can be added later without recomputing or relabeling existing answers.

---

## 7. Validity, reliability, outcomes, privacy, and reassessment

### 7.1 What is and is not validated

The eight-item form is a proposed product questionnaire, not a published validated instrument. Its narrow face/content interpretation is defensible because each item names an implemented feature and maps directly to it. Before calling even that mapping usable, the team should:

- conduct cognitive interviews/think-aloud testing with representative Learners to check relevance, comprehensibility, and missing options;
- include Learners who use assistive technology and test the questionnaire itself for accessibility;
- test every supported-language translation for equivalent meaning rather than literal wording;
- verify in usability tests that the consequence matches what respondents expected;
- report completion/skip rates and preference changes; revise items with systematic misunderstanding.

The COSMIN content-validity framework is health-measurement guidance, not a validation stamp for this product, but its relevance/comprehensiveness/comprehensibility checks and cognitive-interview method are useful development practices. The AERA/APA/NCME testing standards remain the stronger boundary: evidence must support the exact interpretation and use being claimed.

The prototype has **no evidence yet** for predictive validity (“this answer predicts completion”) or consequential validity (“using the answer improves learning”). It must not show confidence percentages, normative comparisons, or a “validated profile” badge.

### 7.2 Using later outcomes cautiously

Later data may include Quiz attempts/scores, completion, reading time, abandonments, preference edits, and Course completion. It can be used to:

- detect obviously poor defaults or UI friction;
- suggest, rather than silently impose, a reversible change (“You often request more detail—switch feedback to detailed?”);
- generate hypotheses for randomized experiments.

It cannot by itself prove causal personalization. Learners self-select settings; Course subject, Starting Level, goal difficulty, question quality, time available, and persistence all confound outcomes. A correlation between `detailed` feedback and high Quiz scores does not mean detailed feedback caused the scores or should be assigned to similar Learners. Any later causal claim requires a suitable randomized comparison (or a carefully designed within-Learner crossover), a common outcome, enough observations, and analysis by predeclared method—not post-hoc type discovery.

Do not overwrite explicit functional needs based on behavior. A fast page transition does not prove that plain language or short paragraphs are unnecessary.

### 7.3 Privacy and data minimization

- Collect only fields with an implemented or planned consequence. Do not collect diagnoses, medical history, IQ, demographics, personality, free-text disability descriptions, or named assistive technologies.
- Explain why each need is requested and how it changes Lessons. “Prefer not to answer” must not penalize access or Progress.
- Treat language and accessibility-related selections as Learner data. Limit each plugin to fields it consumes; do not expose the entire Profile to every plugin or to Source retrieval.
- Provide **Reset to defaults** and delete the saved answers when reset, subject only to a documented minimal audit requirement.
- Do not use Profile fields for advertising, eligibility, grading, risk ranking, or sharing with other Learners.
- If prior versions are kept for research, minimize retention, pseudonymize analytics, and separate operational settings from research datasets.

This follows the direction of 1EdTech AccessForAll (needs/preferences, not medical history) and the GDPR Article 5 data-minimization principle—adequate, relevant, and limited to what is necessary—without making a jurisdiction-specific legal conclusion.

### 7.4 Reassessment and edit behavior

- Assess on the first Course only if no current Teaching Profile exists.
- Always expose **Edit Teaching Profile** and **Reassess Teaching Profile**; neither requires a failure or elapsed time.
- Save `teachingProfileVersion`, `assessedAt`, and `updatedAt`. Do not add a “stability” or confidence score.
- Reassessment should prefill nothing if the goal is a clean retake; editing should show current values. Both produce the same current schema.
- New settings apply automatically to future Course Blueprints.
- Do not silently restructure an already approved Course when the Profile changes. Offer an explicit replan/regenerate action if product scope supports it. Pure rendering changes that do not alter the approved Blueprint (for example continuous versus manual section display) may apply immediately.
- Starting Level remains separately assessed for every Course Request. No Teaching Profile answer updates it.

---

## 8. Risks and unresolved product choices

### 8.1 Risks to carry into the specification

- **Quiz evidence versus Progress gates.** Retrieval-practice studies commonly describe low-stakes practice. A Quiz here must reach 70% for Progress. Unlimited retakes and corrective feedback reduce stakes, but frequent mandatory gates are not identical to the evidence base.
- **False precision.** “Every 2–3 reading Lessons” is a pragmatic default, not an empirically optimal dose across subjects.
- **Capability mismatch.** Do not ask about a language, feedback mode, or section mode unless the relevant plugin can honor it or the UI clearly marks it unavailable.
- **Generator drift.** “Plain language,” “standard feedback,” and “one key idea” need testable generation/rendering rubrics; otherwise deterministic field resolution still produces inconsistent experiences.
- **Cross-course overgeneralization.** Preferences are Learner-level by product decision, but examples/order and Quiz tolerance may vary by subject. Keep one-click per-Course overrides possible without silently rewriting the saved Profile.
- **Accessibility disclosure trap.** Baseline accessibility must not depend on Q2. The question only adds declared presentation requirements.

### 8.2 Genuine human choices still required

1. **Supported-language set and unsupported-language behavior.** Q1 must be populated from actual prototype capabilities. Product must choose whether an unsupported required language blocks generation, offers a clearly labeled machine-translation path, or asks the Learner to use a supported language. Silent fallback is not acceptable.
2. **Whether to add non-gating practice checks later.** The strongest Quiz-frequency evidence concerns low-stakes retrieval. The current domain model makes every Quiz Lesson a 70%-to-complete gate. The prototype can use the recommended 2–3-reading-Lesson cadence as specified, but product should explicitly decide later whether frequent optional checks are a reading content block, a new Quiz mode, or out of scope; the research does not justify relabeling mandatory gates as “low stakes.”

Everything else needed for this ticket can be resolved with the v1 questionnaire and defaults above.

---

## 9. Sources

Claims above use original instrument/specification documentation, original studies, and scholarly reviews/meta-analyses. General blogs and vendor marketing were not used as evidence.

### Learning styles, matching, and instruments

- Pashler, McDaniel, Rohrer, & Bjork, *Learning Styles: Concepts and Evidence* (required crossover test; virtually no qualifying support): https://doi.org/10.1111/j.1539-6053.2009.01038.x
- Rogowsky, Calhoun, & Tallal (2015), *Matching Learning Style to Instructional Method: Effects on Comprehension* (adult reading versus audiobook test; no matching effect): https://doi.org/10.1037/a0037478
- Rogowsky, Calhoun, & Tallal (2020), *Providing Instruction Based on Students' Learning Style Preferences Does Not Improve Learning* (school-age replication): https://doi.org/10.3389/fpsyg.2020.00164
- Clinton-Lisell & Litzinger (2024), *Is it really a neuromyth? A meta-analysis of the learning styles matching hypothesis* (small aggregate result, rare crossover, low-quality evidence, not recommended for widespread adoption): https://doi.org/10.3389/fpsyg.2024.1428732
- Hattie & O'Leary (2025), *Learning Styles, Preferences, or Strategies?* (17-meta-analysis synthesis; matching tests `d = .04`, correlational studies often conflate strategies and styles): https://doi.org/10.1007/s10648-025-10002-w
- Coffield, Moseley, Hall, & Ecclestone (2004), *Learning styles and pedagogy in post-16 learning: A systematic and critical review* (psychometric and pedagogical review of 13 prominent models): https://people.bath.ac.uk/edspd/Weblinks/MA_ULL/Resources/Learning%20Styles/Coffield%20et%20al%202004a%20LSRC.pdf
- Pintrich, Smith, Garcia, & McKeachie (1991), *Manual for the Use of the Motivated Strategies for Learning Questionnaire* (81 items; motivation/strategies for a specific college course): https://files.eric.ed.gov/fulltext/ED338122.pdf
- AERA, APA, & NCME (2014), *Standards for Educational and Psychological Testing* (validity concerns evidence for intended score interpretations and uses): http://www.testingstandards.net/uploads/7/6/6/4/76643089/standards%5F2014edition.pdf

### Retrieval practice, Quiz cadence, and feedback

- Roediger & Karpicke (2006), *Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention*: https://doi.org/10.1111/j.1467-9280.2006.01693.x
- Adesope, Trevisan, & Sundararajan (2017), *Rethinking the Use of Tests: A Meta-Analysis of Practice Testing*: https://doi.org/10.3102/0034654316689306
- Yang, Luo, Vadillo, Yu, & Shanks (2021), *Testing (Quizzing) Boosts Classroom Learning: A Systematic and Meta-Analytic Review* (222 studies; classroom effect and moderators including corrective feedback): https://doi.org/10.1037/bul0000309
- Sotola & Credé (2021), *Regarding Class Quizzes: A Meta-Analytic Synthesis of Studies on the Relationship between Frequent Low-Stakes Testing and Class Performance*: https://doi.org/10.1007/s10648-021-09612-4
- Shute (2008), *Focus on Formative Feedback* (feedback should be task-focused, supportive, timely, and specific; effectiveness depends on task/learner conditions): https://doi.org/10.3102/0034654307313795
- Kulik & Kulik (1988), *Timing of Feedback and Verbal Learning* (immediate feedback usually stronger in applied classroom studies; mixed results by setting): https://doi.org/10.3102/00346543058001079
- Butler, Karpicke, & Roediger (2007), *The Effect of Type and Timing of Feedback on Learning From Multiple-Choice Tests*: https://doi.org/10.1037/1076-898X.13.4.273

### Chunking, pacing, examples, and control

- Rey, Beege, Nebel, Wirzberger, Schmitt, & Schneider (2019), *A Meta-analysis of the Segmenting Effect* (56 investigations; small-to-medium retention/transfer effects, reduced cognitive load, increased learning time): https://doi.org/10.1007/s10648-018-9456-4
- Sweller & Cooper (1985), *The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra*: https://doi.org/10.1207/s1532690xci0201_3
- Barbieri, Miller-Cotto, Clerjuste, & Chawla (2023), *A Meta-analysis of the Worked Examples Effect on Mathematics Performance* (55 studies; average `g = .48`): https://doi.org/10.1007/s10648-023-09745-1
- Kalyuga, Ayres, Chandler, & Sweller (2003), *The Expertise Reversal Effect* (guidance effective for inexperienced Learners can lose benefit or become harmful with expertise): https://doi.org/10.1207/s15326985ep3801_4
- Karich, Burns, & Maki (2014), *Updated Meta-Analysis of Learner Control Within Educational Technology* (overall `g = .05`; effects inconsistent): https://doi.org/10.3102/0034654314526064

### Needs, accessibility, questionnaire development, and privacy

- 1EdTech, *Global Access for All Personal Needs and Preferences Information Model v3.0* (machine-readable interaction needs/preferences; usable independently of medical history): https://www.imsglobal.org/sites/default/files/spec/afa/3p0/information_model/imsafa3p0pnp_v1p0_InfoModel.html
- 1EdTech, *Enhancing Accessibility through 1EdTech Standards* (PNP is not intended to convey medical history): https://www.1edtech.org/standards/accessibility/enhancing-accessibility-through-ims-standards
- W3C WAI, *Cognitive Accessibility at W3C* (adaptable, enough time, readable, predictable, input assistance): https://www.w3.org/WAI/cognitive/
- W3C WAI, *Support Adaptation and Personalization*: https://www.w3.org/WAI/WCAG2/supplemental/objectives/o8-personalization/
- Terwee et al. (2018), *COSMIN methodology for evaluating the content validity of patient-reported outcome measures* (relevance, comprehensiveness, comprehensibility; cognitive interviews): https://doi.org/10.1007/s11136-018-1829-0
- Regulation (EU) 2016/679, Article 5(1)(c) (official EUR-Lex text; data minimization): https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng

---

*End of research note.*
