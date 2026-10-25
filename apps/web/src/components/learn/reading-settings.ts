import type { CSSProperties } from "react";

/*
 * Reading modes and fine controls for the lesson page (docs/uis/redesign/05-reading-modes.md).
 * Show-time only: nothing here changes the Lesson. Stored per Learner in this browser.
 */

export type ReadingLayout = "scroll" | "focus" | "book" | "skim";
export type ReadingFont = "sans" | "serif" | "hyper";
export type ReadingWidth = "narrow" | "medium" | "wide";
export type ReadingSurface = "dark" | "dim" | "sepia" | "paper";
export type ReadingModeKey = "comfort" | "focus" | "spaced" | "book" | "skim";
export type LineSpacing = 0 | 1 | 2;

export type ReadingSettings = {
  /** The mode the fine controls started from (the panel says "custom · <mode>-based" once they drift). */
  mode: ReadingModeKey;
  layout: ReadingLayout;
  font: ReadingFont;
  /** Body text size in px. */
  size: number;
  width: ReadingWidth;
  lineSpacing: LineSpacing;
  letterSpacing: boolean;
  surface: ReadingSurface;
};

type ModeShape = Pick<ReadingSettings, "layout" | "font" | "size" | "width" | "lineSpacing" | "letterSpacing">;

export type ReadingMode = ModeShape & { key: ReadingModeKey; name: string; description: string };

export const READING_MODES: ReadingMode[] = [
  {
    key: "comfort", name: "Comfort", layout: "scroll", font: "sans", size: 18, width: "medium", lineSpacing: 1, letterSpacing: false,
    description: "Clean sans (Manrope), roomy lines, about 66 characters wide. Good for most reading.",
  },
  {
    key: "focus", name: "Focus", layout: "focus", font: "sans", size: 18, width: "medium", lineSpacing: 1, letterSpacing: false,
    description: "Sidebar tucked away, header fades while you read. The paragraph you're on stays lit.",
  },
  {
    key: "spaced", name: "Spaced", layout: "scroll", font: "hyper", size: 20, width: "narrow", lineSpacing: 2, letterSpacing: true,
    description: "Hyperlegible type with extra letter and line spacing. Easier for dyslexic or tired eyes.",
  },
  {
    key: "book", name: "Book", layout: "book", font: "serif", size: 18, width: "medium", lineSpacing: 1, letterSpacing: false,
    description: "Two columns in a book serif, one page at a time. Turn pages with ← →, like an e-reader.",
  },
  {
    key: "skim", name: "Skim", layout: "skim", font: "sans", size: 16, width: "wide", lineSpacing: 0, letterSpacing: false,
    description: "Compact, key sentences highlighted, sections folded. Good for review.",
  },
];

export const FONT_LABEL: Record<ReadingFont, string> = { serif: "Serif", sans: "Sans", hyper: "Hyperlegible" };
export const FONT_STACK: Record<ReadingFont, string> = {
  sans: "var(--font-ui)",
  serif: "var(--font-book)",
  hyper: "var(--font-legible)",
};
export const SURFACE_LABEL: Record<ReadingSurface, string> = { dark: "Dark", dim: "Dim", sepia: "Sepia", paper: "Paper" };
export const LINE_SPACING_LABEL = ["tight", "normal", "airy"] as const;
const LINE_HEIGHT = [1.55, 1.75, 1.95];
/** Target characters per line (research: 50–75). */
const MEASURE: Record<ReadingWidth, number> = { narrow: 56, medium: 66, wide: 80 };

export const MIN_SIZE = 14;
export const MAX_SIZE = 26;

const comfort = READING_MODES[0]!;

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  mode: "comfort",
  layout: comfort.layout,
  font: comfort.font,
  size: comfort.size,
  width: comfort.width,
  lineSpacing: comfort.lineSpacing,
  letterSpacing: comfort.letterSpacing,
  surface: "dark",
};

const SHAPE_KEYS = ["layout", "font", "size", "width", "lineSpacing", "letterSpacing"] as const;

/**
 * The mode whose shape the settings match exactly, or null when they are a custom mix.
 * @param settings - Current settings
 */
export function matchingMode(settings: ReadingSettings): ReadingMode | null {
  return READING_MODES.find((mode) => SHAPE_KEYS.every((key) => mode[key] === settings[key])) ?? null;
}

/**
 * Applies a mode's shape; page colour stays as the Learner set it.
 * @param settings - Current settings
 * @param key - Mode to apply
 */
export function withMode(settings: ReadingSettings, key: ReadingModeKey): ReadingSettings {
  const mode = READING_MODES.find((row) => row.key === key) ?? comfort;
  const shape: ModeShape = {
    layout: mode.layout, font: mode.font, size: mode.size, width: mode.width, lineSpacing: mode.lineSpacing, letterSpacing: mode.letterSpacing,
  };
  return { ...settings, ...shape, mode: mode.key };
}

/**
 * CSS custom properties the reading page reads (`--r-*`).
 * @param settings - Current settings
 */
export function readingStyle(settings: ReadingSettings): CSSProperties {
  return {
    "--r-font": FONT_STACK[settings.font],
    "--r-size": `${settings.size}px`,
    "--r-lh": String(LINE_HEIGHT[settings.lineSpacing]),
    "--r-ls": settings.letterSpacing ? "0.05em" : "0em",
    "--r-ws": settings.letterSpacing ? "0.16em" : "0em",
    "--r-measure": String(MEASURE[settings.width]),
  } as CSSProperties;
}

/** Light reading surfaces inside the dark app. */
export function isLightSurface(surface: ReadingSurface) {
  return surface === "sepia" || surface === "paper";
}

/*
 * Storage. The prototype has one Learner and the browser is not told its id, so the key uses
 * LOCAL_LEARNER_KEY. When auth lands, pass the signed-in Learner's id and each Learner gets their own.
 */
export const LOCAL_LEARNER_KEY = "local";
const storageKey = (learnerKey: string) => `knibbler-reading:v1:${learnerKey}`;

const ONE_OF = {
  mode: ["comfort", "focus", "spaced", "book", "skim"],
  layout: ["scroll", "focus", "book", "skim"],
  font: ["sans", "serif", "hyper"],
  width: ["narrow", "medium", "wide"],
  surface: ["dark", "dim", "sepia", "paper"],
} as const;

/**
 * Reads saved settings, dropping any field that is missing or invalid.
 * @param raw - Parsed JSON
 */
export function parseReadingSettings(raw: unknown): ReadingSettings {
  const out: ReadingSettings = { ...DEFAULT_READING_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  const row = raw as Record<string, unknown>;
  for (const [key, allowed] of Object.entries(ONE_OF)) {
    const value = row[key];
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  if (typeof row.size === "number" && Number.isInteger(row.size)) out.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, row.size));
  if (row.lineSpacing === 0 || row.lineSpacing === 1 || row.lineSpacing === 2) out.lineSpacing = row.lineSpacing;
  if (typeof row.letterSpacing === "boolean") out.letterSpacing = row.letterSpacing;
  return out;
}

/**
 * Saved settings for a Learner; defaults when none are saved or storage is blocked.
 * @param learnerKey - Learner id (LOCAL_LEARNER_KEY until the browser knows it)
 */
export function loadReadingSettings(learnerKey: string): ReadingSettings {
  try {
    return parseReadingSettings(JSON.parse(localStorage.getItem(storageKey(learnerKey)) ?? "null"));
  } catch {
    return { ...DEFAULT_READING_SETTINGS };
  }
}

/**
 * Saves a Learner's settings. Blocked storage just means they won't persist.
 * @param learnerKey - Learner id
 * @param settings - Settings to keep
 */
export function saveReadingSettings(learnerKey: string, settings: ReadingSettings) {
  try {
    localStorage.setItem(storageKey(learnerKey), JSON.stringify(settings));
  } catch {
    // not persisted
  }
}
