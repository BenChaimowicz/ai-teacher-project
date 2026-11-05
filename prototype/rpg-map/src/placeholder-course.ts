import type { DemoCourse, Stop } from "./types";

/**
 * Builds a stand-in Course with generic names, used until `data/index.ts` exists.
 * @param id - Course id
 * @param lessons - How many Lessons (the Goal Check is added on top)
 * @param quizEvery - Every this-many-th Lesson is a Quiz
 * @returns A Course with `lessons + 1` stops, the Goal Check last
 */
export function makePlaceholderCourse(id: string, lessons: number, quizEvery: number): DemoCourse {
  const stops: Stop[] = [];
  for (let i = 1; i <= lessons; i++) {
    stops.push(
      i % quizEvery === 0
        ? { kind: "quiz", title: `Placeholder Quiz ${i}`, bossName: `Placeholder Boss ${i}` }
        : { kind: "reading", title: `Placeholder Reading ${i}`, locationName: `Placeholder Place ${i}` },
    );
  }
  stops.push({ kind: "goal_check", title: "Placeholder Goal Check", bossName: "Placeholder Final Boss" });
  return { id, subject: "Placeholder", learningGoal: "Placeholder Course", stops };
}
