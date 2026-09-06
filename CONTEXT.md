# AI learning course platform

A Learner selects a subject and Learning Goal; the platform assesses their Starting Level and teaching fit, then generates a Course of Lessons synthesized from web Sources.

## Wayfinding

The spec effort was charted with `/wayfinder`. The **map** lives on Linear (team SEN): [Wayfinder map: AI learning course platform](https://linear.app/senoy/issue/SEN-5/wayfinder-map-ai-learning-course-platform), labelled `wayfinder:map`. Its destination was the buildable spec (`docs/spec.md`); that way is clear — do not reconstruct those tickets to start building.

Implementation is a **new effort**: [Prototype: AI learning course platform](https://linear.app/senoy/issue/SEN-30/prototype-ai-learning-course-platform). Tickets are sub-issues of that parent; blocking uses Linear `blocks`; a ticket is unclaimed until assigned. Research assets live in `docs/research/`.

## Language

**Learner**:
The person taking a Course. The prototype has exactly one (a single seeded row, no auth); every learner-owned record carries their id so accounts can be added later without migration.
_Avoid_: User, account (when meaning the person learning)

**Workspace**:
The Learner-facing chrome with the sidebar: Home, Teaching Profile, New Course Request, and Open items. Study hides it.
_Avoid_: dashboard, app shell (when speaking to Learners)

**Home**:
The Workspace screen that shows the Library.
_Avoid_: dashboard, landing

**Library**:
The Home collection of the Learner's published Courses and unpublished Course Requests, including rejected. Empty means a real empty list plus an empty-state message, not a missing screen.
_Avoid_: dashboard, catalog (when meaning Home), media library

**Open items**:
The Workspace sidebar group of shortcuts into in-progress Course Requests and published Courses. Not a fourth screen. Empty when nothing is in flight.
_Avoid_: Open (as a destination), inbox, fourth screen

**Course**:
The generated sequence of Modules that takes a Learner from their Starting Level to their Learning Goal. Once published, it is an immutable snapshot; a different Starting Level is a separate Course.
_Avoid_: Curriculum, class, program, version (when meaning an in-place regenerate)

**Course Request**:
The Learner's selected subject and stated Learning Goal that initiate a goal-specific Assessment and Course generation. It persists with a status through Blueprint review, generation, failure, and publish.
_Avoid_: Prompt, topic request

**Validity gate**:
The Course Request-time decision that combines deterministic policy rules with Generator judgment before Assessment. It passes a valid request, asks the Course Guide to clarify ambiguous framing, or rejects a prohibited or unsupported factual premise.
_Avoid_: Safety prompt, moderation prompt

**Course Guide**:
The Learner-facing copy on the Course Request screen that helps form the request, asks Assessment questions, and explains validity decisions. It presents policy but does not own or override it.
_Avoid_: Character, chatbot, chat transcript, Generator (when meaning this voice)

**Course Blueprint**:
The system-validated and Learner-approved design of a Course, fixing its Module and Lesson sequence, Lesson goals, objectives, teaching methods, and quiz checkpoints before Lesson content is generated. Learner approval reviews titles and Lesson goals for relevance rather than editing the structure directly.
_Avoid_: Course outline, curriculum plan

**Course coherence**:
The continuity of terminology, prerequisites, explanations, and progression across Lessons and Modules toward the Learning Goal.
_Avoid_: Normalization, stylistic consistency

**Publish gate**:
An automated pass/fail check a Course must clear before it publishes. Binary: any failure fails that stage. Not a human review and not a 0–100 quality score.
_Avoid_: quality score, moderation, Test-course protocol (when meaning this check)

**Code check**:
A Publish gate decided by deterministic validation — schema, citation URLs in the retrieval set, plugin method-shape.
_Avoid_: linter (unqualified), Judge check

**Judge check**:
A Publish gate decided by a model that did not author the artifact — claim support, coverage, Quiz alignment, Course coherence, media vision. The authoring model ID must not be the Judge; default and fallback IDs live in config.
_Avoid_: LLM-as-judge (when speaking in-domain), self-eval, Code check

**Learning Goal**:
The terminal capability a Learner wants the Course to produce for a subject. It defines what success means; it is not the Learner's current proficiency, a preference for more content, or a Lesson goal.
_Avoid_: Desired depth, target score, difficulty, Lesson goal (when meaning the Course)

**Lesson goal**:
The one-sentence, Learner-facing capability one Lesson is for. Distinct from the Course Learning Goal and from that Lesson's objectives.
_Avoid_: one-line outcome, outcome, Learning Goal (when meaning this Lesson)

**Objectives**:
The detailed checklist of capabilities a Lesson or Blueprint slot covers. Coverage, reuse fit, and Quiz alignment use these, not Topic tags and not the Lesson goal sentence.
_Avoid_: Lesson goal (when meaning the checklist), Learning Goal, outcomes

**Starting Level**:
The remaining-gap input to Blueprint generation, produced by a Course Request diagnostic: evidenced versus not-evidenced prerequisite capabilities plus a short remaining-gap statement. It is not a 0–100, not a Quiz, not Progress, and not a certification of real-world performance.
_Avoid_: Skill level (when the relevant goal is unstated), entry point, Progress (when meaning assessed capability), placement score, proficiency

**Progress**:
The Learner's 0–100 remaining-gap position through an approved Course, from the first Lesson (0) to the Learning Goal (100). It accumulates by completing Lessons, not by opening them; it is not a re-estimated Starting Level. The formula is completed Lessons over total Lessons in both Sequence modes.
_Avoid_: Starting Level (when meaning the bar), level, capability score

**Sequence mode**:
The Course-level choice of whether Lessons unlock in Blueprint order (linear) or are all openable (free jump). Default is linear, with completed Lessons revisitable. Switching to free jump is one-way.
_Avoid_: Navigation mode, path lock, difficulty

**Teaching Profile**:
The Learner-level result describing teaching-method fit. It must exist before the first Course Request can start, and is reused across later Courses until the Learner explicitly requests reassessment.
_Avoid_: Teaching fit, learning style

**Instructional language**:
The language of generated reading Lessons, Quiz questions, and Quiz feedback. It is a declared Teaching Profile need; this prototype supports English only.
_Avoid_: App language, locale, UI language, translation (when meaning this field)

**Module**:
A named grouping of lessons inside a Course.

**Lesson**:
A single teaching unit that uses one teaching method. Each Lesson belongs to one Course; reuse copies it from any Learner's Course into another rather than sharing the original.

**Lesson completion**:
The event that counts a Lesson toward Progress. A reading Lesson completes when the Learner reaches the end and marks it complete; opening or partial reading does not count. A Quiz completes when the Learner's best score is at least 70%.
_Avoid_: opened, viewed, started

**Teaching method**:
The kind of Lesson — reading, quiz, or a later method. A Lesson uses exactly one.
_Avoid_: format, content type, lesson type

**Teaching-method plugin**:
The developer-added implementation of one Teaching method. It produces, checks, presents, and completes Lessons of that method, and declares which Teaching Profile settings it uses when writing versus when showing. Every Lesson has a shared envelope; the body is method-private.
_Avoid_: plugin (unqualified), marketplace plugin, content type, lesson type

**Topic tag**:
A short topic label on a Lesson, its Blueprint slot, and a library Media descriptor, used only to retrieve Lesson reuse candidates or library media. Lesson-reuse fit is judged on objectives, not on tags.
_Avoid_: keyword, Media category, label (when meaning this index)

**Lesson lineage**:
The recorded origin of a copied Lesson: which Lesson it came from, and whether the copy was verbatim or adapted.
_Avoid_: parent, source (when meaning the origin Lesson), fork

**Quiz**:
A Lesson that uses the quiz teaching method, placed after the instructional Lessons it assesses. It is completed for Progress when the Learner's best score is at least 70% of questions correct, equal weight per question; retakes are unlimited on the same items. A Quiz is always generated for its Course; it is not copied from another Course.
_Avoid_: checkpoint (as a separate object), test, exam, assessment (when meaning this Lesson), Starting Level diagnostic

**Source**:
A published web page the generator used as evidence for a Lesson.
_Avoid_: Hit, result, URL (when meaning the page), reference (when meaning the page)

**Source pack**:
The structured, citation-bearing evidence one research call returns for a Lesson topic. The Generator synthesizes from Source packs, not from a search-result list.
_Avoid_: SERP, hit list, search results (when meaning this artifact)

**Primary research**:
The first research call for a Lesson topic, producing a Source pack.
_Avoid_: web search (when meaning this call), Secondary research

**Secondary research**:
A second research call on the same topic through a different engine and index, producing another Source pack.
_Avoid_: fact-check (unqualified), web search (when meaning this call), Primary research

**Preference list**:
The ranked set of educational hosts the research layer prefers, without excluding the rest of the web.
_Avoid_: Allowlist, whitelist, trusted domains (as a closed set)

**Denylist**:
Hosts the research layer never uses as Sources.
_Avoid_: Blocklist, blacklist

**Citation**:
An inline marker in a Lesson that points at a Source, with a matching entry in the lesson's source list.
_Avoid_: Footnote (the display form), bibliography, reference (when meaning the inline pointer)

**Content block**:
A chunk inside a reading section: prose and, when needed, Demonstrative media. Quiz Lessons do not use content blocks.
_Avoid_: reading section (when meaning this chunk), paragraph (when meaning this unit), page

**Reading section**:
A headed stretch of a reading Lesson, containing Content blocks. Section pacing pauses between these, not between Lessons.
_Avoid_: Module, Lesson, Content block (when meaning the whole stretch), page

**Demonstrative media**:
A product-hosted image, animation, or audio clip inside a reading Lesson that illustrates a technique. Prefer the best existing original, licensed, or Commons file; if none is good enough, generate a simple SVG diagram or pictorial still. Photomicrographs and named-work copies are never generated. Not from Search, not from an off-app video as the teaching clip, and not a separate teaching method.
_Avoid_: AV lesson, video course, teaching method (when meaning the embed), YouTube embed (when meaning the teaching clip)

**Media category**:
A coarse technique-family or subject-slice label on a library Media descriptor, used with Topic tags to retrieve library files. It is not a Topic tag and not a Lesson.
_Avoid_: Topic tag, folder, album

**Media descriptor**:
The kind, caption, alt text, Source, license, origin (library or generated), storage key, Media category, and Topic tags for one piece of Demonstrative media. Library lookup uses category and tags; which Lessons use the file is a join, not a tag. A published Lesson copies these fields so later descriptor edits do not change it.
_Avoid_: metadata (unqualified), sidecar (when speaking to Learners)

**Generator**:
The component that turns retrieved Sources into Lesson content.
_Avoid_: LLM (when meaning this component), synthesizer, agent (when meaning this component)

**Test course**:
One of the three fixed Courses the platform is built against and QA'd through. Subjects: microbiology lab fundamentals (Gram staining as centerpiece), drum kit fundamentals (terminal goal: play "Iris" by the Goo Goo Dolls), and Norse mythology (mythic corpus only).
_Avoid_: Sample course, demo course

**Test-course protocol**:
The destination-QA ritual: after a Test course publishes, the team completes it as a Learner and signs off accuracy, required Demonstrative media, and subject-specific rules. A miss does not un-publish; it blocks treating the spec or prototype as done.
_Avoid_: Publish gate, Learner Blueprint review
