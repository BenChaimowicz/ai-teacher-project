import { QUIZ_METHOD_ID } from "@senoy/db/reading-lesson";
import { Check, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { SegmentedProgress, type SegmentState } from "@/components/ui/progress.tsx";
import { pickCourseIcon } from "@/lib/brand-marks.ts";
import type { StudyLesson, StudyPayload } from "@/lib/study-types.ts";
import { cn } from "@/lib/utils";
import "@/components/learn/learn.css";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Where a Lesson stands for the outline and the segment bar.
 * @param lesson - Study Lesson
 * @param activeId - Lesson on screen
 */
function lessonState(lesson: StudyLesson, activeId: string | undefined) {
  if (lesson.id === activeId) return lesson.completed ? "now done" : "now";
  if (lesson.completed) return "done";
  if (lesson.locked) return "locked";
  return "open";
}

type CourseOutlineProps = {
  payload: StudyPayload;
  activeLessonId?: string;
  /** Section headings of the open reading Lesson, ticked as the Learner reads past them. */
  sections?: string[];
  sectionsRead?: boolean[];
};

/**
 * The Course page in the Study sidebar: icon, title, progress, and every Lesson with its state.
 *
 * Rendered from the payload's modules and lessons, in order, with no assumptions about a fixed plan,
 * so a path that changes (a lesson added or removed by the Adaptive Course project) just re-renders.
 * Lessons the server marks as added can show a "new" tag once the payload carries that flag.
 */
export function CourseOutline({ payload, activeLessonId, sections = [], sectionsRead = [] }: CourseOutlineProps) {
  const lessons = payload.modules.flatMap((module) => module.lessons);
  const quizzes = lessons.filter((lesson) => lesson.teachingMethod === QUIZ_METHOD_ID);
  const quizzesPassed = quizzes.filter((lesson) => lesson.completed).length;
  const segments: SegmentState[] = lessons.map((lesson) =>
    lesson.completed ? "done" : lesson.id === activeLessonId ? "now" : "todo",
  );
  const showModules = payload.modules.length > 1;
  let number = 0;

  return (
    <nav id="study-lessons" aria-label="Lessons" className="l-course">
      <p className="k-sec-h">
        course<span className="n">
          {payload.progress.completed}/{payload.progress.total}
        </span>
      </p>
      <h2 title={payload.course.title}>
        <span className="c-ic" aria-hidden="true">
          <CourseIcon name={pickCourseIcon(payload.course.title)} size={16} />
        </span>
        <span className="c-t">{payload.course.title}</span>
      </h2>
      <p className="l-cstats">
        <span>
          <b>
            {payload.progress.completed}/{payload.progress.total}
          </b>{" "}
          lessons
        </span>
        {quizzes.length > 0 ? (
          <span>
            <b>
              {quizzesPassed}/{quizzes.length}
            </b>{" "}
            quizzes passed
          </span>
        ) : null}
      </p>
      <SegmentedProgress segments={segments} label={`${payload.progress.completed} of ${payload.progress.total} lessons done`} />
      {payload.modules.map((module) => (
        <div key={module.id}>
          {showModules ? <p className="l-mod">{module.title}</p> : null}
          <ul className="l-ol">
            {module.lessons.map((lesson) => {
              number += 1;
              const state = lessonState(lesson, activeLessonId);
              const quiz = lesson.teachingMethod === QUIZ_METHOD_ID;
              const icon = lesson.completed ? <Check /> : lesson.locked ? <Lock aria-label="Locked" /> : null;
              const inner = (
                <>
                  <span className="idx" aria-hidden="true">
                    {pad(number)}
                  </span>
                  <span className="ic">{icon}</span>
                  {lesson.locked ? (
                    <span className="t" aria-disabled="true" title="Locked until you pass the Quiz before it">
                      {lesson.title}
                    </span>
                  ) : (
                    <span className="t">{lesson.title}</span>
                  )}
                  {quiz ? <span className="tag quiz">quiz</span> : null}
                </>
              );
              return (
                <li key={lesson.id} className={state}>
                  {lesson.locked ? (
                    <div className="row">{inner}</div>
                  ) : (
                    <Link
                      to={`/study/${payload.course.id}/lessons/${lesson.id}`}
                      className="row"
                      aria-current={lesson.id === activeLessonId ? "page" : undefined}
                    >
                      {inner}
                    </Link>
                  )}
                  {lesson.id === activeLessonId && sections.length > 0 ? (
                    <ul className="l-subs" aria-label="Sections">
                      {sections.map((heading, index) => (
                        <li key={`${heading}-${index}`} className={cn((sectionsRead[index] || lesson.completed) && "read")}>
                          <i aria-hidden="true">
                            <Check />
                          </i>
                          <span>{heading}</span>
                          {sectionsRead[index] || lesson.completed ? <span className="sr-only"> (read)</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
