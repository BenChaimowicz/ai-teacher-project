# Course completion is a stored Learner-runtime record

A Course is complete for a Learner once every Lesson counts toward Progress. That fact is stored in `course_completions` (one row per Learner and published Course, with `completed_at`), written when the last Lesson completion lands, through either Reading **Mark complete** or a passing Quiz submit. Home, Open items, and the Course-complete screen read the row; they do not recompute completion from the counts.

Storing it explicitly gives a stable completion time and keeps Course complete from flickering if a Course's Lesson count were ever to change. It sits beside `lesson_completions` rather than on `published_courses` because ADR 0003 keeps Progress off the snapshot; unlike Sequence mode (ADR 0004), completion is Learner runtime, not a Course setting.

A `completed_at` column on `published_courses` was rejected for that reason. Deriving completion on read (completed = total) was rejected by SEN-84.
