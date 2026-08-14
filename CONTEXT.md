# AI learning course platform

A learner reports a subject, skill level, and preferred teaching method; the platform generates a course of lessons synthesized from web Sources.

## Language

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
