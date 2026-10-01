import type { NumberedSource } from "@senoy/db/reading-lesson";

/** One Lesson in the Study list. */
export type StudyLesson = {
  id: string;
  title: string;
  teachingMethod: string;
  position: number;
  lessonGoal: string;
  completed: boolean;
  body: unknown;
  citations: NumberedSource[];
};

/** One Module in the Study list. */
export type StudyModule = {
  id: string;
  title: string;
  position: number;
  lessons: StudyLesson[];
};

/** Published Course payload for Study chrome. */
export type StudyPayload = {
  course: { id: string; title: string; sequenceMode: string };
  progress: { completed: number; total: number };
  currentLessonId: string;
  modules: StudyModule[];
};
