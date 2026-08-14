# AI learning course platform

A learner reports a subject, skill level, and preferred teaching method; the platform generates a course of lessons synthesized from web Sources.

## Wayfinding

This effort is charted with `/wayfinder`. The **map** lives on Linear (team SEN): [Wayfinder map: AI learning course platform](https://linear.app/senoy/issue/SEN-5/wayfinder-map-ai-learning-course-platform), labelled `wayfinder:map`. Tickets are child issues of the map; blocking uses Linear `blocks` relations; a ticket is unclaimed until assigned. Research assets live in `docs/research/`.

## Language

**Learner**:
The person taking a Course. The prototype has exactly one (a single seeded row, no auth); every learner-owned record carries their id so accounts can be added later without migration.
_Avoid_: User, account (when meaning the person learning)

**Course**:
The generated sequence of modules that takes a learner from their assessed level to 100.
_Avoid_: Curriculum, class, program

**Module**:
A named grouping of lessons inside a Course.

**Lesson**:
A single teaching unit that uses one teaching method.

**Source**:
A published web page the generator used as evidence for a Lesson.
_Avoid_: Hit, result, URL (when meaning the page), reference (when meaning the page)

**Preference list**:
The ranked set of educational hosts the search layer prefers, without excluding the rest of the web.
_Avoid_: Allowlist, whitelist, trusted domains (as a closed set)

**Denylist**:
Hosts the search layer never uses as Sources.
_Avoid_: Blocklist, blacklist

**Citation**:
An inline marker in a Lesson that points at a Source, with a matching entry in the lesson's source list.
_Avoid_: Footnote (the display form), bibliography, reference (when meaning the inline pointer)

**Generator**:
The component that turns retrieved Sources into Lesson content.
_Avoid_: LLM (when meaning this component), synthesizer, agent (when meaning this component)

**Test course**:
One of the three fixed Courses the platform is built against and QA'd through. Subjects: microbiology lab fundamentals (Gram staining as centerpiece), drum kit fundamentals (terminal goal: play "Iris" by the Goo Goo Dolls), and Norse mythology (mythic corpus only).
_Avoid_: Sample course, demo course
