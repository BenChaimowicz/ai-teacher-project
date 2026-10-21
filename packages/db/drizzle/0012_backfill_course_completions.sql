-- Courses finished before course_completions existed: every Lesson complete, no stored completion.
-- completed_at is the time of the last Lesson completion.
INSERT INTO "course_completions" ("learner_id", "published_course_id", "completed_at")
SELECT c."learner_id", c."id", max(lc."completed_at")
FROM "published_courses" c
JOIN "published_lessons" l ON l."published_course_id" = c."id"
LEFT JOIN "lesson_completions" lc ON lc."lesson_id" = l."id" AND lc."learner_id" = c."learner_id"
GROUP BY c."learner_id", c."id"
HAVING count(l."id") > 0 AND count(lc."lesson_id") = count(l."id")
ON CONFLICT DO NOTHING;
