# Teaching Profile saves do not mutate existing Courses

The spec allows Show-time fields to change how an already-published Course is presented. Applying that now would mean restyling Study for Courses that do not exist yet, and it would split Save into “this setting moves, that one does not,” which is easy to get wrong in the UI. The prototype instead keeps every saved Teaching Profile change forward-looking: existing Courses and in-flight Course Requests stay as they are; new Course Requests use the new answers.

The Learner is told with a confirm dialog, not a toast after the write. First Save has no disclaimer. Save from Edit or Reassess always confirms first, even if the Library is empty: new Course Requests will use these choices; Courses the Learner already has keep their Lessons and layout. Cancel stays in Editing with the draft. Reset has its own confirm: answers are deleted, existing Courses still do not change, and New Course Request is blocked until the next Save.

Silent ignore was rejected (the Learner would think old Courses had changed). Per-field “this one applies now” was rejected as too much UI for this ticket.
