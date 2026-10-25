import { useSyncExternalStore } from "react";
import { logoMarkup } from "@/lib/brand-marks.ts";

/** Accent palettes. The app is always dark; a palette only changes the accent pair. */
export const PALETTES = [
  { key: "amethyst", label: "Purple · light blue", a: "#a78bfa", b: "#7dd3fc" },
  { key: "rose", label: "Red · pink", a: "#fb7185", b: "#f9a8d4" },
  { key: "honey", label: "Yellow · brown", a: "#f5c451", b: "#c8935f" },
  { key: "matcha", label: "Light green · orange", a: "#9ae6b4", b: "#fdba74" },
  { key: "slate", label: "Grey · flashes of blue", a: "#cbd5e1", b: "#60a5fa" },
] as const;

export type PaletteKey = (typeof PALETTES)[number]["key"];

const STORAGE_KEY = "knibbler-theme";
const DEFAULT_PALETTE: PaletteKey = "amethyst";
const listeners = new Set<() => void>();

/**
 * Reads a palette key, falling back to the default for unknown values.
 * @param value - Stored or requested key
 */
function asPalette(value: string | null | undefined): PaletteKey {
  return PALETTES.some((row) => row.key === value) ? (value as PaletteKey) : DEFAULT_PALETTE;
}

/**
 * The palette saved in this browser.
 */
export function readPalette(): PaletteKey {
  try {
    return asPalette(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PALETTE;
  }
}

/**
 * Builds the tab icon from the current palette's colours.
 */
function updateFavicon() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  const markup = logoMarkup({ a: read("--a"), b: read("--b") }, "fav");
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-live]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.dataset.live = "1";
    document.head.appendChild(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

/**
 * Applies a palette to <html>, saves it, and refreshes the favicon.
 * @param key - Palette key
 */
export function applyPalette(key: PaletteKey) {
  document.documentElement.dataset.theme = key;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Private mode can refuse storage; the palette still applies for this visit.
  }
  updateFavicon();
  listeners.forEach((listener) => listener());
}

/**
 * Call once at startup, before first paint, so the saved palette shows immediately.
 */
export function initPalette() {
  applyPalette(readPalette());
}

/**
 * Current palette plus a setter. Every component using it re-renders on change.
 */
export function usePalette(): [PaletteKey, (key: PaletteKey) => void] {
  const palette = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => asPalette(document.documentElement.dataset.theme),
    () => DEFAULT_PALETTE,
  );
  return [palette, applyPalette];
}
