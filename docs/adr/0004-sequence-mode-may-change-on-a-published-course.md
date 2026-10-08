# Sequence mode may change on a published Course, one way only

ADR 0003 makes a published Course an immutable snapshot of Modules and Lessons. Sequence mode lives on the published Course row too, but it is a Course-level setting, not snapshot content: it changes which Lessons may be opened, never what a Lesson says. The Learner's one-way switch from linear to free jump updates `published_courses.sequence_mode` in place. The server refuses free jump → linear.

A separate Learner-runtime record (like completions) was rejected. The prototype has one Learner per Course, and the mode is already chosen per Course at Blueprint review, so a second home for the same value would only add a join.
