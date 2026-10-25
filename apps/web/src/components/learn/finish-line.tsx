import { courseCompletePath, studyPath } from "@senoy/db/progress";
import { ArrowRight, Home, Trophy } from "lucide-react";
import { LinkTiles, type LinkTile } from "@/components/learn/link-tiles.tsx";
import type { StudyLesson } from "@/lib/study-types.ts";
import "@/components/learn/learn.css";

/**
 * The SEN-84 finish line, restyled: Next Lesson, or Finish Course once every Lesson is done.
 * Same rules as before; only the look changed. Renders nothing when there is nowhere to go yet.
 * @param courseId - Course
 * @param next - The next open Lesson, if any
 * @param courseComplete - Every Lesson is complete
 */
export function FinishLine({ courseId, next, courseComplete }: { courseId: string; next: StudyLesson | null; courseComplete: boolean }) {
  const tiles: LinkTile[] = [];
  if (courseComplete && !next) {
    tiles.push({ to: courseCompletePath(courseId), label: "Finish Course", description: "See what you covered", icon: <Trophy />, tone: "primary" });
  } else if (next) {
    tiles.push({
      to: studyPath(courseId, next.id),
      label: "Next Lesson",
      description: `${next.title} · ${next.teachingMethod === "quiz" ? "quiz" : "reading"}`,
      icon: <ArrowRight />,
      tone: "primary",
    });
  } else {
    return null;
  }
  tiles.push({ to: "/", label: "Back to Home", description: "Your other courses", icon: <Home />, tone: "quiet" });
  return (
    <div className="l-finish">
      <LinkTiles tiles={tiles} label="What's next" />
    </div>
  );
}
