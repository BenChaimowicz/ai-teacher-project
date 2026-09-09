# Published Course snapshot is Modules and Lessons, not Progress

A published Course is an immutable snapshot of Modules and Lessons stored as rows, not a JSON blob on the Course and not a React-only fake. Lesson reuse needs a Lesson identity to copy. Progress is Learner runtime on that Course: completions live in a separate record so marking a Lesson complete does not mutate the snapshot. The completed / total figure is derived from those completions, not cached on the Course.

A JSON column was rejected because reuse would have nothing to point at. `completedAt` on the Lesson row was rejected because it would edit the snapshot the glossary calls immutable.
