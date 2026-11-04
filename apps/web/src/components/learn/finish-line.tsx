import { ArrowRight, Flag, Home, Trophy } from "lucide-react";
import { LinkTiles, type LinkTile } from "@/components/learn/link-tiles.tsx";
import { nextStep } from "@/components/learn/next-step.ts";
import type { StudyLesson } from "@/lib/study-types.ts";
import "@/components/learn/learn.css";

/**
 * The SEN-84 finish line, restyled: Next Lesson (Take the Goal Check when the Goal Check is next), or Finish Course
 * once every Lesson is done, then Back to Home.
 * Same rules as before (`nextStep`); only the look changed. Renders nothing when there is nowhere to go yet.
 * @param courseId - Course
 * @param next - The next open Lesson, if any
 * @param courseComplete - Every Lesson is complete
 */
export function FinishLine({ courseId, next, courseComplete }: { courseId: string; next: StudyLesson | null; courseComplete: boolean }) {
  const step = nextStep(courseId, next, courseComplete);
  if (!step) return null;
  const tiles: LinkTile[] = [
    step.kind === "finish"
      ? { to: step.to, label: "Finish Course", description: step.description, icon: <Trophy />, tone: "primary" }
      : step.kind === "goal_check"
        ? { to: step.to, label: "Take the Goal Check", description: "One last check, on what you came for", icon: <Flag />, tone: "primary" }
        : { to: step.to, label: "Next Lesson", description: step.description, icon: <ArrowRight />, tone: "primary" },
    { to: "/", label: "Back to Home", description: "Your other courses", icon: <Home />, tone: "quiet" },
  ];
  return (
    <div className="l-finish">
      <LinkTiles tiles={tiles} label="What's next" />
    </div>
  );
}
