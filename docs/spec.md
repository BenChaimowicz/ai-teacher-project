# AI learning course platform — prototype spec

This is the buildable spec. A separate effort implements the prototype from this file plus [`CONTEXT.md`](../CONTEXT.md). Do not reconstruct Linear tickets to start building.

Terms are defined in `CONTEXT.md`. This spec uses them; it does not redefine them.

---

## 1. How to use this spec

**Destination.** A Learner selects a subject and Learning Goal. The platform estimates a Course-specific Starting Level and applies a reusable Teaching Profile, then generates a Course of reading Lessons and Quizzes from web Sources. Progress is completion plus Quiz results. The prototype is a TypeScript full-stack web app. Success is a spec a separate team can build from, then generate and complete three Test courses.

**Provenance.** Each section ends with ticket and research links. Those are history, not required reading. Later locks supersede earlier ones (for example OpenRouter supplies Generator and Judge model access; two direct research calls replace a single You.com Web Search stack; Teaching Profile is collected before the first Course Request).

**Depth.** This file is normative product behavior: locked numbers, model IDs, screens, plugin methods, job rules, Publish gates, and Test-course constraints. It does not prescribe package layout, file paths, or SQL. Data is conceptual records and fields. Inline types appear only where they state a decision more precisely than prose.

**After this file.** `/to-tickets` cuts vertical implementation slices for two people and their agents. Those tickets are a new effort, not children of [Wayfinder map: AI learning course platform](https://linear.app/senoy/issue/SEN-5/wayfinder-map-ai-learning-course-platform). This spec stays canonical; implementation tickets point at its sections.

### Out of scope

- AV, podcast, presentations, practice, and charts/graphs as **shipped teaching methods**. The plugin architecture is specified; those methods are not built.
- Auth and multi-user accounts. The schema stays multi-user-ready.
- Mid-Course re-estimation of Starting Level. Quizzes do not rewrite the remaining path. A misplaced Learner starts a new Course Request.
- Non-English instructional languages, and a labelled machine-translation path.
- Calibrated IRT, CAT, or knowledge-space placement for open-ended Learning Goals.
- Self-report-only mastery as Starting Level.
- Human review of Lesson bodies. The Learner reviews Blueprint titles and Lesson goals only.
- A free-text chat with the companion (after the subject, every Learner turn is a tap-to-choose option, except **Something else** while focusing the Learning Goal); Learner-facing Lesson reuse or lineage UI.
- Publishing a partial Course; a policy-override or appeal path on the Validity gate.
- Vendor built-in web search on Generator or Judge calls.

Provenance: [Wayfinder map: AI learning course platform](https://linear.app/senoy/issue/SEN-5/wayfinder-map-ai-learning-course-platform), [Spec form](https://linear.app/senoy/issue/SEN-18/spec-form).

---

## 2. Stack, data, and hosting

TypeScript full-stack web app. One seeded Learner; no authentication. Every Learner-owned record carries a `learnerId` so accounts can be added later without migration. The Learner may own many concurrent Courses, each with its own Progress.

**Storage.** Hosted Postgres via Supabase, accessed through Drizzle. No local database. No Redis. No second job system. Drizzle migrations run against that Postgres.

**Run locally against hosted Supabase.** A public URL is not required. Two processes: the web app and a Node worker. The worker claims Course-generation jobs from Postgres (one active job per Course Request). The browser never talks to the worker.

**Named later host.** Railway: one project, two services (web + worker), both on the same Supabase project. Vercel is not the named target. Deploy notes exist so a later push is configuration, not a redesign; this prototype does not have to be pushed.

**Media bytes.** Private Supabase Storage in that project — one bucket, library and generated files together. Unpublished checkpoints and published Lessons store a **storage key**, not a URL. At show time the app serves a stable path of the form `/media/…`. Signed URLs are not stored. Storage object metadata is not the catalog.

**Media catalog.** The Media descriptor is application data. Library lookup uses a Media category plus Topic tags. Which Lessons use a file is a join, not a tag. A library file exists before any Lesson. Published Lessons copy descriptor fields so later catalog edits do not change a shipped Course.

**Secrets (server-only; web and worker share the same keys).** `.env.example` names every key; never commit secrets. Local `APP_URL` default is `http://localhost:3000`.

| Key | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `MEDIA_BUCKET` | Private media bucket name |
| `ACCESS_KEY_ID` | Storage access |
| `SECRET_ACCESS_KEY` | Storage secret |
| `OPENROUTER_API_KEY` | Generator, Judge, and image models |
| `PARALLEL_PRO_API_KEY` | Primary research (Parallel Pro) |
| `YOU_DOT_COM_API_KEY` | Secondary research (You.com) |
| `APP_URL` | Stable `/media/…` origin |

Anthropic is not on the Generator or Judge path and is not a required secret. Claude remains off both paths.

Optional server-only model overrides: `GENERATOR_MODEL`, `GENERATOR_FALLBACK_MODEL`, `LESSON_GENERATOR_MODEL`, `LESSON_GENERATOR_FALLBACK_MODEL`, `JUDGE_MODEL`, and `JUDGE_FALLBACK_MODEL`. Defaults are resolved in the shared model configuration; a model change must preserve author/Judge independence. An invalid or incomplete reply is retried once on the same model, then once on the configured fallback; the Judge never falls back to a model that wrote the artifact (ADR 0015).

**Conceptual records (not SQL).**

- **Learner** — seeded row; Teaching Profile lives here.
- **Course Request** — subject, Learning Goal, status, plain-language reason when failed or rejected; the Goal focus (the goal as typed, the focusing rounds and answers, how it ended, and the confirmed Goal scope); Assessment outcome (Starting Level) on the Request.
- **Teaching Profile** — Learner-level questionnaire fields, version, assessed/updated timestamps.
- **Course Blueprint** — current draft plus last approved snapshot.
- **Generation job** — cursor, stage, remaining repair budget; one active job per Request.
- **Unpublished Lesson** — envelope, method body, Sources, Citations, media files and Media descriptors. Not playable. Not reuse candidates.
- **Published Course** — immutable snapshot of Modules and Lessons. A new Starting Level is a new Course Request, new Blueprint, new job, separate Course.
- **Progress** — completed Lessons over total Lessons for that Course.
- **Quiz attempts** — drafts and scored attempts; best score kept.
- **Media descriptor** — kind, caption, alt, Source, license, origin (`library` \| `generated`), storage key, Media category, Topic tags.

Do not persist token streams or every mark-irrelevant Blueprint round.

Provenance: [Users & data](https://linear.app/senoy/issue/SEN-8/users-and-data), [Runtime generation](https://linear.app/senoy/issue/SEN-15/runtime-generation), [Deployment](https://linear.app/senoy/issue/SEN-17/deployment). Env key names match the provisioned `.env` / `.env.example`.

---

## 3. Screens and Learner navigation

Four screens. Always dark, with five switchable accent palettes. The visual and interaction reference is the SEN-52 redesign in [`docs/uis/redesign/`](uis/redesign/README.md); its decisions list is [`09-implementation-notes.md`](uis/redesign/09-implementation-notes.md). Glossary words stay in code and docs; Learner-facing copy uses plain words ("New course", "Your plan", "How you like to learn", "a few quick questions").

**Product name.** **Knibbler** (silent **k** — spelled *Knibbler*, pronounced like "Nibbler"). Sidebar lockup, browser tab title, greeting, empty states. The logo is the companion's silhouette in a graduation cap; the favicon follows the current palette.

**Companion.** **Nibbles**, a hamster, voices the Course Guide and the scripted turns of every screen (the name lives in one constant; it may change). Low-key, kind, brief; never childish. It presents policy and system state; it cannot override policy or invent decisions. The flow is chat-*like*: Nibbles' line, then tap-to-choose options directly under it. The only free text is where the Learner names what to learn (Compose, Revise request, and **Something else** while focusing the goal). There is no open chat.

**Sidebar.** Present on every screen, collapsible, and never scrolls: a compact companion card (streak, today's minutes against a daily goal), New course, one line per Course (4–5 at most, then "see all on Home"), and "How you like to learn" pinned at the bottom. In Study it shows the Course outline instead of the Course list. Rewards are non-numeric (no points, XP, or levels).

### Home

Published Courses and unpublished Course Requests (including rejected) in one library, grouped: continue (the Course in progress, first), learning, being made, needs you (failed or waiting on the Learner), finished. Older failed or cancelled attempts collapse behind a "clear them" row. Each Course shows a per-Course icon picked at Blueprint time ([`08-course-icons.md`](uis/redesign/08-course-icons.md)). Opening a published Course leaves Home for Study. Opening an unpublished Request opens that Request at its current status. First run greets the Learner and asks what they want to learn.

### Teaching Profile

Shown as "How you like to learn": a short guided conversation with tap-to-choose answers (SEN-56), one question at a time, with a live summary the Learner can edit per answer. Required before the first Course Request can start: first visit lands here; New Course Request waits until the Profile is saved. Reassess only when the Learner opens this screen and asks to. Seven of the eight questions in §4 are asked; Q1 is not shown while English is the only language.

This overrides the first-run *order* in Assessment design (Profile after a passed Request). Orthogonality to Starting Level is unchanged.

Standalone Profile edit or reassess does not run a Starting Level diagnostic.

### Course Request

One screen for every unpublished status. The body follows status; these are not extra destinations.

| Status surface | What the Learner does |
| --- | --- |
| Compose | One typed line: a topic ("Norse mythology") or what the Learner wants to be able to do. It is saved as the subject and as the Learning Goal as typed. There is no generic goal question; Goal focusing asks what part and how deep, with options built from the subject. A topic picked elsewhere (Home, Go deeper) is saved straight away. |
| Validity | Pass, one clarification, or reject. Reject: plain-language reason, safe reframe, **Revise request** (editable new Request). Rejected stays in history. No appeal. |
| Focus | Nothing, if the goal is already precise. Otherwise a few tap-to-choose questions per round (each with **Something else** and **A broad overview is fine**), then the proposed goal with what it covers and leaves out: **That's it**, **Not quite** (while rounds remain), or **A broad overview is fine**. |
| Assessment | First, **How much do you know about this already?**: **Brand new to this** (no items; Starting Level is the Learner's own word, §4.3) or **I know some of it** (the check). Then honesty copy; eight three-option items plus **I don’t know**. |
| Remaining-gap | **Looks right** or **too easy** (expand the gap; shown as **Start a bit earlier**, since it adds basics). No “I’m more advanced.” |
| Ceiling | Thin Blueprint or revise the Learning Goal. Never auto-publish an empty Course. |
| Assessment-failed | **Retry diagnostic** only. |
| Blueprint review | Titles and Lesson goals; mark irrelevant (optional why); Sequence mode picker (linear default; free jump one-way). Approve. Closing the tab returns here. Not a job. |
| Waiting | Blueprint prep or Course generation: stage, current Lesson title, N of M, generating vs repairing. No draft body, Sources, or token stream. **Cancel** keeps checkpoints and does not auto-resume. **Resume** continues. |
| Terminal fail | Plain-language reason, **Retry** or **Revise request**. |

The **Course Guide** is the companion's lines in a chat-like thread on this screen: history scrolls up, the current step and its options sit right under the latest line. Server steps the Learner does not need to trigger (Validity check, the first focusing turn, Blueprint prep) start automatically after the Learner answers. Clarification answers are offered as options; **Revise request** reopens the topic field. It presents policy; it cannot override it. (Changed by SEN-52: previously "ordinary page copy, not a chat, not a character, not a side rail".)

### Study

Only a published Course. Land on the current Lesson (no Course overview first). The sidebar shows the Course outline (Lessons with state, Progress, the current Lesson's sections) and is collapsible. A header is always present, in every reading mode: sidebar toggle, back to Home, Lesson title, reading progress, and the **Aa** reading panel. Reading and Quiz share this chrome; the plugin supplies the body.

- **Reading modes** ([`05-reading-modes.md`](uis/redesign/05-reading-modes.md)): Comfort (default, Manrope), Focus, Spaced, Book, Skim, all shipped, plus font, size, width, line and letter spacing, and page colour: Dark (default), Dim, Sepia, Paper. Sepia and Paper are light reading surfaces inside the always-dark app. Show-time only; stored per Learner.
- **Reading:** reading sections, Demonstrative media, then the companion's end-of-Lesson prompt (**I've read it**, the completion action). Opening or partial reading does not complete. With `sectionAdvance = manual`, pause after each section until Continue; with `continuous`, scroll. Never auto-advance to the next Lesson.
- **Quiz:** shown one item at a time in the chat-like format; draft until Submit; every item must have an answer; untimed; open-book (completed Lessons stay revisitable). With `feedbackTiming = per_item`, each item has **Check**, which locks that answer and shows right/wrong together with the correct answer and its explanation (a wrong pick shakes and the right one lights up; there is no separate Show answer step); Submit waits until every item is checked. With `end_of_quiz`, right/wrong, the correct answers and explanations all arrive with Submit. Retake in place; seeing answers does not block retakes. An attempt keeps the timing it started with. The draft is saved on the server; grading is server-side, and an item's answer key reaches the browser only in the response that gives that item feedback (its Check, or Submit), never before the Learner has answered it. (Changed by SEN-88: previously the Learner opened answers with **Show answer**, only while the best score was under 100%.)

Progress is completed Lessons / total Lessons. Opening does not complete. Progress never drops.

### Sequence mode and Lesson completion

Sequence mode is Course-level. Default: linear unlock; completed Lessons revisitable. The Learner may choose free jump at Blueprint review or later via a menu. Switching to free jump is one-way; the disclaimer says linear cannot be restored. Sequence mode does not change the Blueprint or generation — only unlock rules.

- Linear: a Quiz gates later Lessons until it is passed. Readings before the first unpassed Quiz stay open, completed or not.
- Free jump: later Lessons stay open.
- Progress waits on a Quiz pass in both modes (best score `correct / n ≥ 0.70`).

A reading Lesson completes when the Learner reaches the end and marks it complete. A Quiz completes when best score is at least 70%.

Provenance: [Redesign: inspiration and direction](https://linear.app/senoy/issue/SEN-52/redesign-inspiration-and-direction), [UI scope (screens)](https://linear.app/senoy/issue/SEN-10/ui-scope-screens), [Level-to-course mapping](https://linear.app/senoy/issue/SEN-12/level-to-course-mapping), [Quiz mechanics](https://linear.app/senoy/issue/SEN-13/quiz-mechanics), [Plugin contract](https://linear.app/senoy/issue/SEN-14/plugin-contract), [Runtime generation](https://linear.app/senoy/issue/SEN-15/runtime-generation), [Decide product name](https://linear.app/senoy/issue/SEN-51/decide-product-name).

---

## 4. From Teaching Profile to approved Blueprint

### 4.1 Teaching Profile

A direct, editable questionnaire — not VARK, not learning-style labels, not a composite score. Store declared functional needs separately from changeable feature preferences. Every preference supports “No preference” and skip. Resolve each field independently. Version the questionnaire (`teachingProfileVersion = 1`).

Intro copy (the guarantee said once, positively; SEN-52):

> No right answers. You can skip any question and change any of this later.

Do not claim the questionnaire diagnoses ability or disability, predicts the best method, or that matching a “learning style” improves learning. Do not collect diagnoses, medical history, IQ, demographics, personality, or named assistive technologies. Prefer-not-to-answer must not penalize access or Progress. Provide **Reset to defaults** (delete saved answers). Profile fields are not used for advertising, eligibility, grading, or sharing with other Learners.

Each plugin consumes only the semantic fields it declared. Future plugins add or consume fields without assigning a Learner type.

**Q1 — Instructional language (single select).** This prototype supports English only. **Not shown while English is the only language (SEN-52):** the setup asks Q2–Q8, `instructionLanguage` resolves to `en` from the default, and Generator prompts state that Lessons, Quizzes, and feedback are written in English. The options below apply when a second language ships.

1. **English** — persist `instructionLanguage = en`.
2. **I need a language that is not listed** — disclaimer that Lessons are English only at this moment, then continue with `instructionLanguage = en`. “Not listed” is not a persistable language code. No machine-translation path. Do not save an unsupported language and fail later at generation.
3. **Prefer not to answer** (and skip) — English, same default as other Profile skips.

Drop “Use my current app language.” Silent substitution is prohibited: an explicit “not listed” choice must show the disclaimer; skip / prefer-not-to-answer may default to English without that disclosure.

`instructionLanguage` is consumed by reading and Quiz **generation** only. Course Guide, Assessment, Blueprint, chrome, and Demonstrative-media captions are English because the app is English, not because those surfaces read the field.

**Q2 — Reading requirements (multi-select).** Plain direct wording; short paragraphs with clear headings; define unfamiliar terms where they first appear; None of these; Prefer not to answer. `None` and Prefer-not-to-answer are mutually exclusive with the other choices. Sets `requiredReadingSupports` flags. Baseline accessibility (no time limit, screen-reader and keyboard operation) does not depend on this answer.

**Q3 — Reading-Lesson scope.** Compact / Standard / Extended / No preference / Prefer not to answer. `contentScope = compact | standard | extended`. Conceptual scope, not a word count. Default: `standard`.

**Q4 — Section pacing.** Pause after each section until Continue / continuous scroll / No preference / Prefer not to answer. `sectionAdvance = manual | continuous`. Default: `continuous`. Show-time: may change already-published Courses on screen.

**Q5 — Example order.** Example then explain / explain then example / No preference (Generator chooses topic-appropriate order) / Prefer not to answer. `explanationOrder = example_first | principle_first`. Order only, not scaffolding dosage.

**Q6 — Quiz cadence.** After every reading / after every 2–3 readings / at Module end / No preference / Prefer not to answer. `quizCadence = every_reading | every_2_to_3_readings | module_end`. Blueprint places Quiz Lessons at the interval while still placing each Quiz after the instructional Lessons it assesses. Default: `every_2_to_3_readings`. Write-time.

**Q7 — Feedback timing.** After each question / after submitting the whole Quiz / No preference / Prefer not to answer. `feedbackTiming = per_item | end_of_quiz`. Default: `per_item`. Show-time. The Learner must answer before feedback appears.

**Q8 — Feedback detail.** Brief / Standard / Detailed / No preference / Prefer not to answer. `feedbackDepth = brief | standard | detailed`. All three include the correct answer and a reason; the preference changes depth. Default: `standard`. Show-time: every Quiz item stores all three depths, and Study shows the current one.

Field resolution (from the research note; encodes the lock):

```ts
type ProfileAnswer<T> =
  | { status: "selected"; value: T }
  | { status: "no_preference" }
  | { status: "skipped" };

type DeclaredNeed<T> =
  | { status: "declared"; value: T }
  | { status: "none_declared" }
  | { status: "skipped" };

type ResolvedSetting<T> = {
  value: T;
  source: "declared_need" | "stated_preference" | "evidence_default";
};
```

A supported declared need is mandatory. A stated preference selects that behavior. `no_preference` or `skipped` uses the product default. Record provenance; do not infer missing answers.

Write-time fields apply only to future Blueprints and must not silently rewrite an approved Course. Show-time fields may change presentation of already-published Courses.

### 4.2 Course Request and Validity gate

The Learner creates a Course Request by selecting a subject and stating a Learning Goal. The Validity gate runs **before Assessment**. It does not search.

**Authority.** Versioned application rules own hard prohibitions. Those rules are also injected into the Generator’s system prompt, which judges whether the remaining subject and Learning Goal are real and learnable. The Course Guide cannot override policy or invent a different decision.

**Three outcomes:** **pass**, **clarify**, or **reject**. Ambiguous framing gets one targeted clarification. A request is rejected only after the Learner confirms an unsupported factual premise, or when a hard prohibition applies.

**Learnability.** A documented subject, fictional corpus, or legitimate capability can be learned. “Norse mythology” passes when framed as studying the mythic corpus. “How to feed unicorns” is clarified (mythology vs creative writing vs false real-world animal care); the last framing is rejected.

**Hard prohibitions.** Reject requested outcomes that operationally facilitate violence, weapon construction, self-harm, abuse, exploitation, serious crime or other illegal conduct, or pornographic arousal. Allow descriptive, academic, historical, preventive, health, and legal study that does not provide operational harmful instruction. The boundary is enablement, not whether a topic mentions harm. If any requested outcome is prohibited, reject the entire Request. Do not silently strip the dangerous portion. The Course Guide may suggest a safe replacement.

**Named copyrighted works.** A Learning Goal that names a song, book, or film **passes**. Clarify or reject only when the requested outcome is the protected copy itself (generate the chart, paste the lyrics, embed the film). Naming the Course after the work is not a copyright issue. No request-time copyright speech. Operational illegal enablement is still rejected under the hard rules.

#### Focusing the Learning Goal

Validity decides whether a request is real and learnable; it does not decide which part of a subject the Learner means. **Goal focusing** runs after Validity **pass** and before the Starting Level diagnostic, on every Course Request. Validity's one clarification stays separate: it settles learnability, focusing settles scope (ADR 0020). Focusing reads the clarification and its answer as settled and never asks it again.

**Detect.** A bare topic is never precise. The Generator rates the goal on three questions: does it name a facet of the subject, a depth or purpose (overview, be able to do or retell it, analyse it), and a finish line? The rating is structured output and code decides: only a goal that answers all three is **precise**, and a precise goal passes straight through with nothing asked. "Name the Æsir and Vanir and how they are related" is precise; "explain the main stories and figures in the Norse mythic corpus" is not.

**Ask.** Up to three rounds of one to three questions each. Each question offers two to five answers built from the subject's real facets, plus **Something else** (a short typed answer) and **A broad overview is fine**. Each round narrows what earlier answers left open, and stops once facet, depth, and finish line are clear. After the last round the Course Guide must propose.

**Result.** The Course Guide proposes a rewritten Learning Goal plus a **Goal scope**: in scope and out of scope, each a short list of facets. The Learner may tap any entry to move it between the two lists (in scope keeps at least one) before **That's it** confirms it; the rewritten goal becomes the Request's Learning Goal; the goal as typed stays recorded. **Not quite** asks another round while rounds remain. **A broad overview is fine**, at any point, records a deliberate broad overview with no scope. Its Learning Goal is a one-sentence broad-overview goal the Course Guide writes from what was typed when it first asks (a bare topic is not a goal sentence).

**Statuses.** `validity_passed` (first turn runs automatically), `awaiting_focus_answers`, `awaiting_focus_confirmation`, then `goal_focused`, from which the diagnostic starts. Status is explicit, not derived from the stored focus.

**Consumers.** The diagnostic probes capabilities inside the scope only. The Blueprint author and Judge treat out-of-scope facets as off-limits for slots and objectives (§6.2). Each Lesson's research topic carries the scope (§5.3). Both Judges' `sequence_reaches_goal` judge the focused goal within its scope (§6.2, §6.5). With no scope (precise, or a broad overview) every stage behaves as before.

**Carry-over.** **Revise request** and **Change my goal** copy the current Learning Goal, focused or not, into the new draft as editable text. The draft runs Validity and focusing again; a focused goal is usually precise and passes straight through.

Examples: “history of firearms” passes; “build an untraceable gun” fails. “Sexual health” passes; pornographic instruction fails. Studying criminal law passes; operational instruction for committing a serious offense fails.

### 4.3 Starting Level diagnostic

After goal focusing, on **every** Course Request, a generated diagnostic — not a 0–100, not a Quiz, not Progress, not a certification of real-world performance. Teaching Profile is orthogonal: never infer Profile from the diagnostic or Starting Level from the Profile. Diagnostic items are never reused as Course Quizzes.

**Procedure.** The Generator decomposes the Learning Goal, within its Goal scope when there is one, into eight prerequisite capabilities (necessary or strongly supporting; answerable in English MCQ; span likely-novice through near-goal; at least two application-in-words items). One three-option single-correct MCQ per capability, plus a separate **I don’t know**. No true/false, multi-select, all/none of the above, or negative stems. For named-work goals, items target transferable skills, not reproduction of the protected copy.

Assessment does not wait for Lesson Source retrieval. A **bounded fact-check** of keyed answers that are external factual claims is allowed; it is not Lesson Source retrieval (no Preference list, no Citations, no stored Lesson Sources). Skip retrieval for purely definitional keys.

**Checks.** Haladyna-style item-writing rules (code + prompt) and a second-model Judge that did not author the items. The Judge answers without seeing the key; flags 0 or >1 defensible keys, item-writing flaws, construct-irrelevant performance demand, and ungrounded factual keys. Regenerate failing items. If the set still fails, follow failure below.

**Scoring.** Correct → evidenced. Incorrect, I don’t know, and skip → not evidenced. No formula scoring. Do not display percent-correct. Incorrect may signal a misconception the Blueprint should address; I don’t know and skip signal absence of evidence — neither is “worse” for scoping.

**Honesty copy (before items):**

> This is a short check of knowledge related to your Learning Goal so we can start the Course in the right place. It is not a Quiz, not a grade, and not a test of intelligence. If you are not reasonably sure, choose **I don’t know**. You will review the Course Blueprint before anything is generated.

Starting Level handed to the Blueprint (from the research note):

```ts
type EvidenceStatus = "correct" | "incorrect" | "dont_know" | "skipped";

type ProbedCapability = {
  id: string;
  statement: string;
  itemId: string;
  status: EvidenceStatus;
};

type StartingLevel = {
  learningGoal: string;
  probedCapabilities: ProbedCapability[];
  remainingGapStatement: string;
  coverageNote: string;
  extremity: "floor" | "mixed" | "ceiling" | "insufficient_evidence";
};
```

No `percentCorrect`, no write to Progress.

**Mapping.** Evidenced capabilities may be treated as already in place. Not-evidenced capabilities belong in the remaining-gap. Do not assume a validated hierarchy: if a near-goal item is correct and a fundamental is not, keep a mixed profile and include the missed fundamental.

- **Floor** (zero or one correct, or all I don’t know/skip): remaining-gap from fundamentals; confirmation required.
- **Ceiling** (all correct, or all but one): remaining-gap may be thin. Never claim the Learner already meets a performance goal. Offer a thin Blueprint or revise the Learning Goal. Never auto-publish an empty Course.
- **Mixed:** keep missed fundamentals; do not average into a fake band.

**Remaining-gap confirmation.** Show the remaining-gap statement, not a 0–100. **Looks right** proceeds. **Too easy** treats additional fundamentals as not evidenced (expand the gap). No global “I’m more advanced” override.

Scaffolding *dosage* (worked-example amount, tighter sequencing) follows Starting Level. Profile `explanationOrder` is order only.

**Construct limits for Test courses.** The diagnostic may ask written knowledge (reagent roles, 4/4 vs 6/8, attested corpus facts). It must not claim wet-lab competence, kit playing, or living religious competence. Coverage notes must say so.

**Brand new to this.** Before the items, the Course Guide asks how much the Learner knows already. **Brand new to this** skips the items: the Starting Level is a floor with no probed capabilities, marked as the Learner's own word (`selfReportedNew`), with the statement “You're new to this, so the course starts from the very beginning.” It is never shown or stored as a diagnostic result. The Blueprint starts from the fundamentals of the whole Learning Goal (within its Goal scope) and sizes the Course for a newcomer. **I know some of it** takes the diagnostic. Eight “I don't know” answers would tell the Blueprint the same thing while making a newcomer sit through them (ADR 0021).

**Failure.** Retry once with the fallback Generator model. If the set still fails, the Course Request is **assessment-failed**; offer **Retry diagnostic** only. Do not invent Starting Level from self-report, with one exception below. Do not offer a “Start from fundamentals” shortcut that looks like a completed diagnostic. Mid-diagnostic abandon: persist partial responses; do not Blueprint until the set is complete or the Learner confirms floor-from-insufficient-evidence.

### 4.4 Course Blueprint

The generator is told subject, Learning Goal, Goal scope (when focused), Starting Level, and the write-time Teaching Profile fields the Blueprint consumes (including `quizCadence`). No slot, title, Lesson goal, or objective teaches an out-of-scope facet, and the sequence reaches the focused goal within its scope. It designs the Module and Lesson sequence for that remaining gap alone: what the whole Learning Goal needs that the Learner does not yet have. The diagnostic's probed capabilities sample the goal; they do not list it, so a Blueprint teaches the missed probes and whatever else the goal clearly needs, and skips only what the diagnostic evidenced. There is no canonical novice→goal outline and no unpublished prefix. Remaining-gap scope lives on the Blueprint; Lessons have no difficulty score.

Each slot: title, Lesson goal, non-empty objectives, registered teaching method (`reading` or `quiz`), 2–5 Topic tags (lowercase slugs from the slot’s objectives; no closed taxonomy). A Quiz slot lists the instructional slots it assesses (those slots exist, are `reading`, and precede it) and lists 1–10 objectives. No two slots share a Lesson goal. At least one instructional Lesson and one Quiz sit on the path from Starting Level to Learning Goal.

For named-work goals, the Blueprint deconstructs the Learning Goal into generic skill Lessons that do not belong to the work. Lesson titles and Lesson goals may name the work as the destination so the Learner can judge relevance. Generation fills those slots; it does not invent a transcription and does not silently rewrite a slot mid-job.

**System validation** (Publish-gate Blueprint checks, §6) runs before Learner review. A fail is a Blueprint revision, then Learner review again — not Lesson repair.

**Learner review** is shallow: titles and Lesson goals for relevance. The Learner can mark irrelevant items and optionally explain why; the system revises and revalidates and presents again. The Learner does not directly delete or reorder Lessons. Sequence mode is chosen here (or later via menu). After **Approve**, full-Course generation starts.

A material structural discovery during generation returns to Blueprint generation, system validation, and Learner review. The pipeline never silently diverges from the approved Blueprint. On structural return: discard **all** unpublished Lessons; keep the Course Request, the return reason, and the new Blueprint draft. After re-approval, generation starts from Lesson 1.

Provenance: [Teaching Profile via questions](https://linear.app/senoy/issue/SEN-24/teaching-profile-via-questions) (`docs/research/teaching-profile-via-questions.md`), [Instructional language scope](https://linear.app/senoy/issue/SEN-27/instructional-language-scope), [Search synthesis failure modes](https://linear.app/senoy/issue/SEN-19/search-synthesis-failure-modes), [Validity gate policy](https://linear.app/senoy/issue/SEN-25/validity-gate-policy), [Copyrighted works as Learning Goals](https://linear.app/senoy/issue/SEN-26/copyrighted-works-as-learning-goals), [Assessment design: learning goal, starting level, and teaching fit](https://linear.app/senoy/issue/SEN-21/assessment-design-learning-goal-starting-level-and-teaching-fit) (`docs/research/assessment-design.md`), [Generation pipeline](https://linear.app/senoy/issue/SEN-11/generation-pipeline), [UI scope (screens)](https://linear.app/senoy/issue/SEN-10/ui-scope-screens), [Focus the Learning Goal](https://linear.app/senoy/issue/SEN-90/focus-the-learning-goal-question-the-learner-when-a-goal-is-broad-or).

---

## 5. Course generation

Explicit staged workflow with bounded repair. Not an open-ended agentic flow. The entire Course is generated before it is available. Publication is atomic.

### 5.1 Durable job

Approved full-Course generation is a durable Postgres-backed job. One active job per Course Request. Stages that run as jobs: after Assessment, Blueprint generation and validation; after mark-irrelevant, Blueprint revision; after Approve, sequential Lesson generation then Quizzes, bounded repair, and atomic publish.

**Checkpoints.** A Lesson is not finalized until its body and Demonstrative media are done (library-attach or generate-fallback inside sequential generate; Quizzes skip media). Each finalized unpublished Lesson is saved. Crash, provider timeout, and Cancel keep those checkpoints. Cancel stops the worker and does not auto-resume. Resume continues from the next unfinalized Lesson, same approved Blueprint, same remaining repair budget.

**Retry vs Revise vs structural return.**

- **Transient** interruption: reason is “generation was interrupted.” Retry = resume.
- **Terminal** (repair exhausted, or still unresearchable after reformulation): keep unpublished Lessons before the failure; they stay unplayable. Retry = new attempt at that Lesson with a fresh repair budget, same approved Blueprint. Revise request = editable new Course Request; this one stays failed; unpublished Lessons discarded. No publish-what-we-have.
- **Structural return:** discard all unpublished Lessons; keep Request, reason, and new Blueprint draft.

### 5.2 Pipeline stages after Approve

1. Research is scoped per Lesson. Instructional Lessons are generated sequentially in Blueprint order, carrying forward summaries, established terminology, and prior commitments. Course coherence is prioritized over parallel generation.
2. Lookup-before-generate runs at this time (§5.8). Quizzes are never reuse candidates.
3. Each Quiz is generated only after the instructional Lessons it assesses are finalized, using both their content and the Blueprint objectives.
4. Validation runs during generation and again across the finished Course (§6).
5. Non-structural defects use targeted repair: regenerate the earliest defective Lesson and affected downstream Lessons or Quizzes, then revalidate.
6. Publication is atomic. Intermediate artifacts are not playable.

### 5.3 Two research calls

Retrieval is two independent research calls on the same Lesson topic, not a single web-search API. With a Goal scope, the topic names what the Course covers and leaves out. The Generator synthesizes from both Source packs. Citations must point at Sources that appear in those packs; invented URLs are dropped. Vendor built-in web search is off.

| Slot | Implementations (config picks one) | Job |
| --- | --- | --- |
| **Primary research** | Parallel Pro **or** Exa Agent high | Structured Source pack with citations |
| **Secondary research** | You.com Research standard **or** Linkup M | Same topic, different engine, different index |

Preference list and Denylist are host policy in the app, not a vendor-specific `boost_domains` scheme. `.edu` / `.gov` may be used as query hints; they are not automatic trust. Do not auto-promote every `.edu`. Prefer canonical hosts over aggregators. For scholarly topics, overlay OpenAlex or Semantic Scholar and prefer peer-reviewed secondary sources over news. Quotes come from extracted page text, not truncated snippets. Wikipedia via stable `oldid`. Cite and paraphrase OER; do not remix CC BY-NC-SA corpora into Lesson bodies. Issue English queries; do not hard-reject non-English Sources and do not machine-translate them. Keep a useful non-English page; the Lesson stays English; the source list keeps the published title and URL. Do not fail a Lesson solely because a Source is not English.

**Preference list (named hosts, not a closed web):** `openstax.org`, `khanacademy.org`, `ocw.mit.edu`, `britannica.com`, `en.wikipedia.org`, plus subject bodies (e.g. `cdc.gov`, `nist.gov`, `nasa.gov`). Drum-kit Test course also: `pas.org`, `vicfirth.com`, `ae.vicfirth.com`, `commons.wikimedia.org`. Optionally `online.berklee.edu` for public catalog pages.

**Do not prefer:** Drumeo, Hudson Music, Musicnotes, Ultimate Guitar, Songsterr, YouTube.

**Denylist:** junk hosts, content farms, social scrapes, quiz mills, Pinterest, unlicensed tab mills. Post-filter in app even if a vendor misses. Do not denylist YouTube solely to hide it; treat it as cite-the-URL, do-not-scrape.

**Source vetting.** A Denylist cannot name every shop. Before the Generator writes, the Judge model vets each non-preferred Source and drops shop, product and marketing pages, commercial blogs, and content farms. The Generator never sees a vetted-out Source, so citing one is a Citation to an unknown ID. Vetted-out Sources and reasons are stored with the Lesson checkpoint. Vetting is the only reliability check: every Source the Generator is given may be cited, and the reading Judge does not judge a Source's reliability again (ADR 0016).

Give every retrieved excerpt a stable source ID. Pass those excerpts to the Generator. Require source IDs in the generated Lesson. Reject citations to unknown IDs.

Persist with each Lesson:

```ts
type LessonSource = {
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string; // ISO 8601
  usedAs: "quote" | "paraphrase";
  quotedText?: string; // required if usedAs === "quote"
  license?: string;
  doi?: string;
};
```

Numbered inline Citations plus a stored source list. Paraphrase by default. Quotes: in-text attribution + footnote + stored `quotedText`.

**Copyrighted named works in Lessons.** Display first, link last, never generate a fake copy.

- **Display** chart, excerpt, still, or diagram when the Source’s license allows this product to reproduce it, with creator credit when known, plus a numbered Citation.
- Otherwise **link** to the Source (free host or purchase) as a normal Citation. A link is last resort, not a special Lesson or warning dialog.
- **Never invent** a stand-in copy. Do not transcribe, quote lyrics/dialogue/notation, or paraphrase into playable or readable instructions that substitute for the work.

No-copy hosts (sheet/tab stores, streaming audio/video files, personal-license course sites) → link only. A stated reuse license this product can comply with → display with credit. Unclear → link. Keep Sources we cannot copy in the source list. Encyclopedia-level facts are fine. A missing licensed reproduction is a **successful Course**, not a research miss. Emitting protected expression is a Lesson defect.

### 5.4 Generator models

Domain **Generator** port. Model IDs live in shared server configuration, not on Lesson records. Generator and Judge use one OpenRouter transport; vendor-specific SDK types do not cross the domain ports. Parallel Pro and You.com research remain direct and separate.

| Role | OpenRouter model ID | How |
| --- | --- | --- |
| Leading writer | `deepseek/deepseek-v4-pro` | Shared strict JSON-schema Chat Completions transport |
| Fallback writer | `openai/gpt-6.1-sol` | Same transport; selection belongs to the calling generation stage |
| Lesson writer (Readings and Quizzes) | `openai/gpt-6.1-sol` | Same transport (ADR 0018) |
| Lesson fallback writer | `deepseek/deepseek-v4-pro` | Writes a fresh draft once the Lesson writer's repairs run out (ADR 0017) |

Claude is not a Generator fallback. No direct DeepSeek/OpenAI text adapters are required. Structured calls use `response_format: json_schema`, strict mode, `provider.require_parameters: true`, application-side output validation, and no search tools or plugins. Invalid output, refusal, interruption, or timeout is a provider failure, never a passing validity decision.

Domain operations: `generateCitedReading` then `generateStructured`. Generate the cited reading first; generate quiz JSON from that reading (and, at Course time, from the assessed Lesson bodies plus Blueprint objectives). Two-step contract stays even when a provider could combine schemas.

### 5.5 Teaching-method plugin

A teaching method is a developer-registered **Teaching-method plugin**, not a Learner marketplace and not a hot-loaded package. Adding a method is a code change that registers: a stable method id; **generate**, **validate**, **render**, and **complete**; and which Teaching Profile fields it uses **when writing** versus **when showing**.

This prototype ships `reading` and `quiz`.

**Shared Lesson envelope:** Course, Blueprint slot, teaching method, title, Lesson goal, objectives, Topic tags, Lesson lineage, Sources, Citations. Generate also receives the Course Learning Goal, prior-Lesson Course context, only the write-time Teaching Profile fields this method declared, retrieved Sources or a reuse candidate, and — for a Quiz — the instructional Lessons it assesses. It returns one finished Lesson (envelope + method body). The Learner cannot open it until the Course publishes atomically.

The reading and Quiz authors write to one teaching style guide: a reason to care, examples, signposting, questions that check understanding, a recap, and one teaching voice. It adds structure and explanation, never facts (ADR 0019).

**Reading body:** ordered reading sections, each with a heading and content blocks (prose and optional Demonstrative media). Numbered Citations live in the prose.

**Quiz body:** 5–10 single-correct four-option items. Each item stores a `brief`, `standard`, and `detailed` explanation (Q8 is show-time). No reading sections. No Demonstrative media. Generator chooses `n` in 5–10. Equal weight per question. Pass is the raw ratio `correct / n ≥ 0.70`. Unlimited retakes, same question set, best score kept. Prototype does not generate new items per attempt.

### 5.6 Demonstrative media

Hosted inside the reading Lesson. Not an AV teaching method. Not from Search JSON. Off-app links may be ordinary Citations. Quizzes skip media.

**Order, inside sequential Lesson generate, after caption/alt exist, before checkpoint:**

1. Library lookup by Media category + Topic tags. A hit is good enough only if the product can host the license (public domain, CC0, CC BY, CC BY-SA, or original we own — **not** CC BY-NC), the file depicts the intended technique or object, caption/alt can be honest, and it is not a named-work substitute.
2. On miss: ingest, do not hotlink. Wikimedia Commons Action API (`generator=search` + `imageinfo` `extmetadata`) with a descriptive User-Agent; Gram photomicrographs also from CDC PHIL public-domain records (credit CDC/contributor, no CDC logo). Copy bytes into private Storage; write a library Media descriptor. Not You.com Images; not YouTube / Vic Firth / PAS scrapes.
3. On still miss: generate.
   - Default: constrained SVG from the text Generator (`image/svg+xml`). Validate: no `script`, no `foreignObject`.
   - Pictorial stills SVG cannot draw: OpenAI `gpt-image-2` (pin snapshot `gpt-image-2-2026-04-21`, 1024×1024 WebP, medium quality, `moderation: "auto"`). Customer owns image Output. Organization Verification may be required.
   - Loops only when motion is load-bearing: silent SVG/CSS (or SVG-frame / 2–4-frame animated WebP), cap ~4 seconds, no soundtrack. If that fails, sequenced stills. Never video (Sora/Videos API out).
4. Vision Judge on attached stills/loops (or a still frame of a loop): binary fitness vs caption/alt — not Gram-species ID from a generated stain. One moderation/vision repair, then Lesson defect on **required** slots. Optional decorative media may skip.
5. Snapshot descriptor fields onto the Lesson.

**Never generate:** photomicrographs, named-work copies, living-person likeness, or video. Audio is library-or-skip (no TTS or generated percussion in this prototype). Prototype ships a small seeded catalog covering the Test-course slots in §7.

### 5.7 Course coherence

Sequential generation carries forward summaries, established terminology, and prior commitments. Coherence beats parallel speed. Whole-Course Judge (§6) checks the assembled sequence without re-judging every Lesson from scratch.

### 5.8 Lesson reuse

Lessons are Course-owned copies with lineage, not live shared assets. Lookup runs during sequential generation, in Blueprint order, after prior Lessons in this Course are finalized — not at Blueprint review.

1. **Identity.** Each Lesson belongs to one Course. Reuse copies a published Lesson into the new Course and records Lesson lineage (origin Lesson, verbatim or adapted). The original is never mutated. Pool: every Learner’s published Lessons. Unpublished artifacts are not candidates.
2. **Retrieval.** Same subject + same teaching method + at least one overlapping Topic tag. Tags retrieve; they do not judge fit.
3. **Fit.** No numeric similarity score. The Generator compares the Blueprint slot’s objectives to each candidate.
   - **Verbatim** when objectives are equivalent (same capability, same remaining-gap scope) and the body is compatible with this Course’s running terminology.
   - **Adapt** when method and subject match and objectives overlap, but terminology, examples, depth, or scope need a pass.
   - **Generate** otherwise.
4. **Adapt** is a coherence-and-scope pass, not a rewrite and not new research. It may change terminology to match this Course, swap examples, trim material outside this remaining gap, lightly fill a missing sub-objective still inside the slot, and align title and Lesson goal to the Blueprint slot. It must not change teaching method or the slot’s objectives, and must not add claims that need new Sources. Remaining Citations stay; dropped claims drop their Citations. If the pass cannot satisfy the slot, fall through to generate.
5. Equivalent objectives with a term clash is adapt, not verbatim. The Learner-approved Blueprint title and Lesson goal always win. The resulting Lesson joins running commitments for later slots. Reuse never drops, merges, or reorders slots. Verbatim reuse is not a skip card for Publish gates.
6. **Quizzes are always generated.** Never reuse candidates.

The Learner never picks reuse. No lineage UI.

### 5.9 Generation failure modes

Two kinds of “cannot generate,” at two different points:

1. **Invalid Request** — Validity gate (§4.2). Immediate. No search, no Assessment, no generation spend.
2. **Legitimate subject, hard-to-research Lesson** — empty Source packs mean “hard to research,” never “invalid.” Retry with 2–3 rewritten/broader queries. If still empty, generation of the Course fails with a clear reason. No Blueprint-revision loop, no low-confidence Lesson, no skipping the Lesson.

**Contradicting Sources are content, not failure.** Teach the consensus / most-authoritative position. When the contradiction matters to the Learning Goal, present it as an open point with Citations to both sides.

**Ungrounded factual claims are a hard fail.** Validation checks each factual claim against retrieved excerpts — not merely that cited URLs exist. Bounded repair; exhaustion fails generation rather than publishing.

Failed Requests persist with a plain-language reason and a suggested next step. No partial Course ever appears.

Provenance: [Generation pipeline](https://linear.app/senoy/issue/SEN-11/generation-pipeline), [Runtime generation](https://linear.app/senoy/issue/SEN-15/runtime-generation), [Source trust scheme](https://linear.app/senoy/issue/SEN-6/source-trust-scheme) (`docs/research/source-trust-scheme.md`), [LLM provider](https://linear.app/senoy/issue/SEN-7/llm-provider) (`docs/research/llm-provider.md`), [Provider bakeoff: OpenAI vs DeepSeek](https://linear.app/senoy/issue/SEN-20/provider-bakeoff-openai-vs-deepseek), [Plugin contract](https://linear.app/senoy/issue/SEN-14/plugin-contract), [Generated demonstrative media](https://linear.app/senoy/issue/SEN-28/generated-demonstrative-media) (`docs/research/generated-demonstrative-media.md`), [Lesson reuse across Courses](https://linear.app/senoy/issue/SEN-23/lesson-reuse-across-courses), [Search synthesis failure modes](https://linear.app/senoy/issue/SEN-19/search-synthesis-failure-modes), [Copyrighted works as Learning Goals](https://linear.app/senoy/issue/SEN-26/copyrighted-works-as-learning-goals), [Quiz mechanics](https://linear.app/senoy/issue/SEN-13/quiz-mechanics), [Instructional language scope](https://linear.app/senoy/issue/SEN-27/instructional-language-scope).

---

## 6. Publish and destination QA

Two bars, not one.

### 6.1 Publish gates

Automated, binary, on every Course (including Test courses). Any fail fails that stage. No 0–100 quality score. No “publish at 80%.” Plugin `validate` is schema and method-shape. Learner pass-at-70% is a runtime Quiz rule, not a generation threshold. No extra English-fluency gate.

**Code checks** stay in process. **Judge checks** are graded by a model that **did not author** that artifact.

| Role | Model |
| --- | --- |
| Default Judge (text and vision) | `openai/gpt-6-luna` |
| Judge fallback | `openai/gpt-6.1-sol`, **only when Sol did not author** that artifact |

Pairing: author `deepseek/deepseek-v4-pro` or `openai/gpt-6.1-sol` → judge `openai/gpt-6-luna`. If Luna is down or schema-fails: bump to Sol only when Sol did not write. Never DeepSeek as Judge. Never Sol judging a Sol-authored artifact. Do not default to Claude Sonnet or Opus.

Independence is different **model ID**, not different vendor. IDs live in config behind a thin Judge port, not on Lesson records.

Call shape: shared OpenRouter Chat Completions transport; strict `json_schema`; no search tools; our source-ID excerpts. The application persists finalized artifacts, not model token streams. Vision is a **separate** Luna request with attached images (`image_url`, `detail: "high"`) so a media miss spends the one vision repair, not a Lesson regeneration. For a loop, pass a still frame. Binary JSON only:

```ts
type JudgeResult = {
  pass: boolean;
  failedChecks: string[];
  reasons: string[];
};
```

If Test-course protocol finds missed factual errors, bump Judge SKU in config (`luna` → `gpt-6.1-sol`) without changing the pairing rule — never to the authoring model.

**Repair budget.** Two regenerations per slot after the first failed validate (initial generate + two repairs). A Reading repair edits only the passages the failed checks name and keeps every other sentence verbatim, so a repair cannot add new problems elsewhere in the Lesson (ADR 0016). A third failure on a Reading or Quiz slot sends it to the Lesson fallback writer, which writes a fresh draft from the same Sources or Lessons with its own two repairs (ADR 0017); only a failure after those is terminal: keep unpublished Lessons before it; Course Request fails; Retry refreshes that slot’s budget on the same approved Blueprint; Revise request discards unpublished Lessons. No Course-wide repair pool. Retrieval’s 2–3 query reformulations and the one media vision repair stay inside generate and do not draw on this number. A Judge **fail** consumes a regeneration of the artifact, not a second Judge SKU, unless the Judge call itself errored.

### 6.2 Blueprint (before Learner review)

**Code:** every slot has title, Lesson goal, non-empty objectives, and a registered method (`reading` or `quiz`); a Quiz slot lists the instructional slots it assesses (those slots exist, are `reading`, and precede it); no two slots share a Lesson goal; at least one instructional Lesson and one Quiz sit on the path from Starting Level to Learning Goal; a Quiz slot lists 1–10 objectives.

**Judge:** coverage (no remaining-gap capability is left untaught); the sequence reaches this Learning Goal from this Starting Level, which is the same check the whole-Course Judge makes (§6.5), so a sequence that cannot reach the goal fails here, before any Lesson is written; prerequisite order; no redundant slot; each Quiz’s assessed Lessons are the right chunk; with a Goal scope, no slot or objective teaches an out-of-scope facet (`out_of_scope`), and reaching the goal is judged within the scope.

A Blueprint fail is a Blueprint revision, then Learner review again.

### 6.3 Reading Lesson (before checkpoint)

**Code:** envelope + reading plugin `validate`; every Citation URL is in this Lesson’s retrieval set; required Demonstrative media has a hostable Media descriptor; SVG has no script / `foreignObject`.

**Judge:** every factual claim is supported by a retrieved excerpt from a cited Source (a plainly marked analogy or invented example is not a claim, as long as it states no fact about the subject); every slot objective is taught; sequential coherence with prior finalized Lessons; no generated substitute of a named work; media vision on attached stills/loops (required slots fail closed; optional decorative may skip).

### 6.4 Quiz (before checkpoint)

**Code:** `n` in 5–10, four options, exactly one correct key, no reading sections, no Demonstrative media; assessed slots exist, are `reading`, precede this Quiz, and are checkpointed.

**Judge:** every Quiz-slot objective is hit by ≥1 item; each item is answerable from those Lessons only; exactly one option is unambiguously correct; distractors are plausible but wrong.

If a Quiz slot lists more than 10 objectives, that is **structural**: discard unpublished Lessons and return to Blueprint review. Quizzes are always generated.

### 6.5 Whole-Course (before atomic publish)

Do not re-judge every Lesson from scratch.

**Code:** every Blueprint slot has a checkpointed unpublished Lesson whose Code and Judge both passed; required media still attached; no extra Lessons off the approved Blueprint.

**Judge:** one pass over titles, Lesson goals, objectives, and short per-Lesson commitments — Course coherence across Modules, and the assembled sequence reaches this Learning Goal from this Starting Level (within its Goal scope, when focused; out-of-scope facets are not required).

If that Judge names a **Lesson**, targeted repair from that earliest Lesson and affected downstream, then this pass again. If it names the **sequence**, structural return to Blueprint review. Retrying cannot fix the sequence, so it is never offered for one. Until the structural return is built (SEN-85), the Request fails with a reason that says so and points to a new Course Request.

### 6.6 Test-course protocol

Destination QA after publish. Not a Publish gate. Does not un-publish.

After each Test course publishes, the team takes it as the Learner: complete every Lesson (readings marked complete, Quizzes at best ≥ 70%). Sign off that you would use it to reach that Learning Goal (no blocking factual error the gates missed; required Demonstrative media actually teaches the technique), plus the subject-specific rules in §7.

A miss does not un-publish. The spec/prototype is not done until all three pass. Fix the gap and start a new Course Request (published Courses stay immutable). If the miss is a missing Publish gate, add that gate and regenerate.

Provenance: [Quality bar](https://linear.app/senoy/issue/SEN-16/quality-bar), [Publish-gate judge models](https://linear.app/senoy/issue/SEN-29/publish-gate-judge-models) (`docs/research/publish-gate-judge-models.md`).

---

## 7. Test courses

Selection driver: personal learning goals, which doubles as authentic QA. Course content is derived from Starting Level, not a fixed syllabus. The spread stresses three generation modes: procedural-scientific, motor-skill-via-text, and narrative-factual.

### 7.1 Microbiology lab fundamentals

Broadened from Gram staining, which stays the centerpiece; also aseptic technique, microscopy, culture methods. A Learner entering at a higher Starting Level skips evidenced basics.

**Media.** Gram photomicrographs are real library files (CDC PHIL and/or Commons), never generated. Cell-wall and procedure diagrams: library first, else SVG schematic — never a fake microscope field. Optional silent sequence of reagent steps from library/SVG states, not a video model.

**Protocol extra:** Gram photomicrographs are real library files, never generated.

**Diagnostic honesty:** lab *knowledge*, not sterile technique.

### 7.2 Drum kit fundamentals

Theory plus offline practice: Lessons teach notation, rudiments, and coordination patterns, and prescribe kit practice the Learner does alone. Quizzes test theory only. The platform never assesses playing.

**Terminal Learning Goal:** play “Iris” by the Goo Goo Dolls end-to-end, as transferable 4/4 vs 6/8 skills, encyclopedia facts, a practice prescription, and a pointer to buy licensed sheet — never a generated chart or official audio.

**Sources.** You.com-class search returns pages, not teaching images. Demonstrative media from cited pages (Commons) or product-owned/licensed files. Preference-list adds PAS / Vic Firth / Commons as in §5.3. Cite PAS/Vic Firth; do not copy PAS © 1984 engravings, Alfred audio, Vic Firth videos, Stick Control exercises, or any “Iris” transcription or sound recording.

**Media-reliance.** Anatomy and notation: text + stills. Grip/stroke and rock-beat coordination **require** Demonstrative media inside the reading Lesson (library grip stills; SVG schematic if stills miss; silent rebound loop or sequenced stills; no photorealistic generated hands as the technique source). Playing the song end-to-end cannot be taught or assessed under reading+quiz-only.

**Protocol extra:** no Iris chart or official audio.

**Diagnostic honesty:** drumming *theory*, not whether the Learner can play.

### 7.3 Norse mythology

Canonical term (not “Viking mythology”). Mythic corpus only: cosmology, gods, major myths; Poetic/Prose Edda as primary Sources. Viking history/archaeology appears only as context.

**Media.** Public-domain historic plates (e.g. Doepler, Frølich). Caption: one artist’s depiction, not a photograph of a place and not “the” canonical Valhalla. Generate only a simple original diagram, captioned as illustration not reconstruction. No franchise look.

**Protocol extra:** mythic corpus with credited historic art, not a franchise Valhalla.

**Diagnostic honesty:** facts and relations in the named corpus, not belief or every text in the tradition.

Provenance: [Test subjects (the 3 courses)](https://linear.app/senoy/issue/SEN-9/test-subjects-the-3-courses), [Drumming source availability](https://linear.app/senoy/issue/SEN-22/drumming-source-availability) (`docs/research/drumming-source-availability.md`), [Generated demonstrative media](https://linear.app/senoy/issue/SEN-28/generated-demonstrative-media), [Copyrighted works as Learning Goals](https://linear.app/senoy/issue/SEN-26/copyrighted-works-as-learning-goals), [Quality bar](https://linear.app/senoy/issue/SEN-16/quality-bar).
