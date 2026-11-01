import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

/** SVG content the product never hosts: scripts, embedded HTML, event handlers and remote references (spec §5.6). */
const UNSAFE_SVG = /<script|<foreignObject|\son[a-z]+\s*=|href\s*=\s*["']\s*(https?:)?\/\//i;

/**
 * Whether SVG markup holds content the product never hosts: a script, embedded HTML, an event handler or a remote
 * reference (spec §6.3). The seed refuses such a file, and a Reading checks again before it attaches one.
 * @param bytes - The SVG file's bytes
 */
export function isUnsafeSvg(bytes: Uint8Array): boolean {
  return UNSAFE_SVG.test(Buffer.from(bytes).toString("utf8"));
}

/** The one font SVG labels are drawn with, committed beside the package so a host without fonts draws them too. */
const FONT_FILE = resolve(fileURLToPath(new URL(".", import.meta.url)), "../fonts/DejaVuSansCondensed.ttf");

/** Width a diagram is drawn at for the vision check: wide enough for its smallest labels to be read. */
const RASTER_WIDTH = 1600;

/**
 * Draws an SVG diagram as a PNG, for a vision model that cannot read SVG. Labels use the committed DejaVu Sans
 * Condensed, which sets about as wide as the Helvetica the diagrams were drawn for, and transparent areas are white.
 * @param bytes - A safe SVG file's bytes
 * @returns The PNG's bytes
 * @throws Error when the SVG cannot be parsed or drawn
 */
export function rasterizeSvg(bytes: Uint8Array): Uint8Array {
  try {
    const drawn = new Resvg(Buffer.from(bytes), {
      fitTo: { mode: "width", value: RASTER_WIDTH },
      background: "white",
      font: { loadSystemFonts: false, fontFiles: [FONT_FILE], defaultFontFamily: "DejaVu Sans Condensed", sansSerifFamily: "DejaVu Sans Condensed" },
    }).render();
    return new Uint8Array(drawn.asPng());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[svg.ts: rasterizeSvg] Failed to draw an SVG as PNG || bytes=${bytes.byteLength} || ${message}`);
  }
}
