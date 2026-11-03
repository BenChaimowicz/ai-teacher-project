/**
 * The paper colours a scene plan may name. The house tones are the papercraft tokens in `apps/web/src/index.css`
 * (desk, sheet, plum, apricot, cream, bookmark red, gold, text); the subject tones are the few paper-like colours
 * the two test scenes needed (greens, wood, skin, stain purple, safranin pink, water). A plan names a colour from this
 * list and never a raw hex, so every illustration shares one palette.
 */
export const PAPER_COLOURS = [
  "desk", "sheet", "raised", "plum", "plum-light",
  "apricot", "apricot-deep", "cream", "cream-deep", "red", "gold", "text",
  "leaf", "leaf-dark", "leaf-light", "wood", "wood-dark", "wood-light",
  "skin", "skin-deep", "water", "stone", "glass", "clear", "ink",
  "violet", "violet-deep", "safranin", "iodine",
] as const;

/** One of {@link PAPER_COLOURS}. */
export type PaperColour = (typeof PAPER_COLOURS)[number];

/** The hex value behind each paper colour. */
export const HEX: Record<PaperColour, string> = {
  desk: "#0b0e18",
  sheet: "#141a2e",
  raised: "#18203b",
  plum: "#2a1f3c",
  "plum-light": "#352748",
  apricot: "#d8955c",
  "apricot-deep": "#9b5f31",
  cream: "#f0e0c2",
  "cream-deep": "#d4bc95",
  red: "#c8473b",
  gold: "#e7b250",
  text: "#ebe6dc",
  leaf: "#5d7a58",
  "leaf-dark": "#44593f",
  "leaf-light": "#7c9670",
  wood: "#7a5236",
  "wood-dark": "#553824",
  "wood-light": "#94694a",
  skin: "#e0ad87",
  "skin-deep": "#a4704d",
  water: "#2f4f70",
  stone: "#8a8478",
  glass: "#b9cbd3",
  clear: "#818f9e",
  ink: "#3a2d4f",
  violet: "#6a3d9a",
  "violet-deep": "#4b2a72",
  safranin: "#d95c7f",
  iodine: "#8a5426",
};

/**
 * The hex value of a paper colour.
 * @param colour - A palette name
 */
export function hex(colour: PaperColour): string {
  return HEX[colour];
}

/**
 * Splits a hex colour into its channels.
 * @param value - `#rrggbb`
 */
function channels(value: string): [number, number, number] {
  const n = parseInt(value.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Mixes two hex colours.
 * @param a - The colour at `t = 0`
 * @param b - The colour at `t = 1`
 * @param t - How far from `a` towards `b`, 0 to 1
 * @returns `#rrggbb`
 */
export function mix(a: string, b: string, t: number): string {
  const A = channels(a);
  const B = channels(b);
  const part = (i: number) => Math.max(0, Math.min(255, Math.round(A[i] + (B[i] - A[i]) * t))).toString(16).padStart(2, "0");
  return `#${part(0)}${part(1)}${part(2)}`;
}

/**
 * A hex colour moved towards white.
 * @param value - `#rrggbb`
 * @param t - 0 keeps it, 1 is white
 */
export function lighten(value: string, t: number): string {
  return mix(value, "#ffffff", t);
}

/**
 * A hex colour moved towards black.
 * @param value - `#rrggbb`
 * @param t - 0 keeps it, 1 is black
 */
export function darken(value: string, t: number): string {
  return mix(value, "#000000", t);
}
