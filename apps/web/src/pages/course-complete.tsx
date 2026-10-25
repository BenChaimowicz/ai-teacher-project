import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { isPassingScore } from "@senoy/db/quiz";
import { ShellTitle } from "@/components/shell/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import type { CourseSummary } from "@/lib/study-types.ts";

/**
 * Course-complete screen: what the Course covered, Quiz results, and the way back to Home.
 * A Course that is not complete yet sends the Learner back to Study.
 */
export function CourseCompletePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [summary, setSummary] = useState<CourseSummary | null>(null);
  const [notComplete, setNotComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setSummary(null);
    setNotComplete(false);
    setError(null);
    fetch(`/api/courses/${courseId}/summary`)
      .then(async (response) => {
        if (response.status === 409) {
          if (!cancelled) setNotComplete(true);
          return;
        }
        if (response.status === 404) throw new Error("Published Course not found.");
        if (!response.ok) throw new Error("Could not load the Course summary");
        const body = (await response.json()) as CourseSummary;
        if (!cancelled) setSummary(body);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load the Course summary");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (notComplete && courseId) return <Navigate to={`/study/${courseId}`} replace />;

  return (
    <>
      {error ? <ErrorState title="The summary didn't load">{error}</ErrorState> : null}
      {!error && !summary ? <PageLoader /> : null}
      {summary ? (
        <div className="mx-auto w-full max-w-3xl">
          <ShellTitle>{summary.course.title}</ShellTitle>
          <p className="text-sm text-muted-foreground">Course complete</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{summary.course.title}</h1>
          <p className="mt-2 text-muted-foreground">You worked toward: {summary.course.learningGoal}</p>

          <section className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight">What you covered</h2>
            {summary.modules.map((module) => (
              <div key={module.id} className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{module.title}</p>
                <ul className="mt-2 grid gap-2">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id} className="rounded-lg border border-border bg-card p-3">
                      <p className="font-medium">{lesson.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{lesson.lessonGoal}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {summary.quizzes.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-xl font-semibold tracking-tight">Quiz results</h2>
              <ul className="mt-4 grid gap-2">
                {summary.quizzes.map((quiz) => (
                  <li key={quiz.lessonId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                    <span className="font-medium">{quiz.title}</span>
                    <span>
                      {quiz.best
                        ? `Best score ${quiz.best.correct} / ${quiz.best.total}${isPassingScore(quiz.best) ? " · Passed" : ""}`
                        : "Not taken"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-10 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/">Back to Home</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to={`/study/${summary.course.id}`}>Review Lessons</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
