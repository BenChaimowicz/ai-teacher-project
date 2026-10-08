import { quizPlugin } from "./quiz.ts";
import { readingPlugin } from "./reading.ts";
import type { TeachingMethodPlugin } from "./types.ts";

const plugins: Record<string, TeachingMethodPlugin> = {
  [readingPlugin.id]: readingPlugin,
  [quizPlugin.id]: quizPlugin,
};

/**
 * Registered Teaching-method plugin for a Lesson's method.
 * @param method - `published_lessons.teaching_method`
 * @returns The plugin, or null for an unregistered method
 */
export function teachingMethodPlugin(method: string): TeachingMethodPlugin | null {
  return plugins[method] ?? null;
}
