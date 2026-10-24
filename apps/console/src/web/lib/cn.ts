import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and lets later Tailwind classes win over earlier ones.
 * @param inputs - Class names, arrays, or `{ class: condition }` objects
 * @returns One merged class string
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
