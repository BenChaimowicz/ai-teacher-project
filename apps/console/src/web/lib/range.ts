import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useRefresh } from "@/lib/refresh";

/** Time range presets, in the order the picker shows them. */
export const RANGE_PRESETS = ["1h", "today", "24h", "7d", "30d", "all"] as const;

/** Picker labels per preset. */
export const RANGE_LABELS: Record<(typeof RANGE_PRESETS)[number], string> = {
  "1h": "1h",
  today: "Today",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "All",
};

/** "All" starts here: well before the platform captured anything. */
const ALL_FROM = Date.UTC(2024, 0, 1);
/** A preset, or a custom `from`/`to` pair. */
export type RangePreset = (typeof RANGE_PRESETS)[number] | "custom";

/**
 * Start of a preset's window.
 * @param preset - The preset
 * @param to - The window's end (now), epoch ms
 * @returns Epoch ms
 */
function presetFrom(preset: (typeof RANGE_PRESETS)[number], to: number): number {
  switch (preset) {
    case "1h":
      return to - 3_600_000;
    case "today": {
      const d = new Date(to);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "24h":
      return to - 86_400_000;
    case "7d":
      return to - 7 * 86_400_000;
    case "30d":
      return to - 30 * 86_400_000;
    case "all":
      return ALL_FROM;
  }
}

/** The default matches the console API's default (last 7 days). */
export const DEFAULT_RANGE: RangePreset = "7d";

/** URL params that make up the time range; links between views carry them along. */
export const RANGE_PARAM_KEYS = ["range", "from", "to"] as const;

/** The resolved time range. */
export type TimeRange = {
  preset: RangePreset;
  /** ISO instant. */
  from: string;
  /** ISO instant. */
  to: string;
};

/**
 * Reads the time range from the URL (`?range=24h` or `?range=custom&from=…&to=…`). Relative presets are resolved
 * against "now" once per refresh tick, so the window slides forward on refresh without refetch loops.
 * @returns The range plus setters that keep other URL params intact
 */
export function useTimeRange(): TimeRange & {
  setPreset: (preset: (typeof RANGE_PRESETS)[number]) => void;
  setCustom: (from: string, to: string) => void;
} {
  const [params, setParams] = useSearchParams();
  const { tick } = useRefresh();
  const rawPreset = params.get("range");
  const rawFrom = params.get("from");
  const rawTo = params.get("to");

  const range = useMemo<TimeRange>(() => {
    if (rawPreset === "custom" && rawFrom && rawTo) return { preset: "custom", from: rawFrom, to: rawTo };
    const preset = (RANGE_PRESETS as readonly string[]).includes(rawPreset ?? "")
      ? (rawPreset as (typeof RANGE_PRESETS)[number])
      : (DEFAULT_RANGE as (typeof RANGE_PRESETS)[number]);
    const to = Date.now();
    return { preset, from: new Date(presetFrom(preset, to)).toISOString(), to: new Date(to).toISOString() };
    // `tick` is a dependency on purpose: each refresh re-anchors "now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPreset, rawFrom, rawTo, tick]);

  const setPreset = useCallback(
    (preset: (typeof RANGE_PRESETS)[number]) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("range", preset);
        next.delete("from");
        next.delete("to");
        next.delete("page");
        return next;
      }),
    [setParams],
  );

  const setCustom = useCallback(
    (from: string, to: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("range", "custom");
        next.set("from", from);
        next.set("to", to);
        next.delete("page");
        return next;
      }),
    [setParams],
  );

  return { ...range, setPreset, setCustom };
}

/**
 * Converts an ISO instant to the value a `datetime-local` input wants (local time, minutes).
 * @param iso - ISO instant
 * @returns e.g. `2026-10-24T13:02`
 */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Bucket length the console API uses for the Overview timeseries. */
export const BUCKET_MS = { hour: 3_600_000, day: 86_400_000 } as const;
