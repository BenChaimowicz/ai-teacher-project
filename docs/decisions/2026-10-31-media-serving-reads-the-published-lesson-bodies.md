---
date: 2026-10-31
tickets: SEN-55
people: Ben
status: active
---

# `/media/<key>` serves a file only when a published Lesson's body holds a media block with that storage key, found by one jsonb containment query

The descriptor snapshot inside the published Lesson body is the only record of which Lesson uses which file. The media route asks `published_lessons` whether any body contains a media block with the requested storage key, and serves the bytes from the private bucket only then. Checkpoints and catalog files no Lesson has shipped stay unreachable.

**What we turned down:** a `published_lesson_media` join table written in the publish transaction. It makes "which Lessons use this descriptor" an indexed lookup, but every row would copy a fact the body already holds, and the two could drift.

**What it costs:** the route's check is a containment scan over published bodies rather than an index hit. That is fine at prototype scale. If it gets slow, a GIN index on `body` fixes it without changing what is true.
