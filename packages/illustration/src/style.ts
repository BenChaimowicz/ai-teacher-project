import { Resvg } from "@resvg/resvg-js";
import roughModule from "roughjs";
import type { RoughGenerator } from "roughjs/bin/generator.js";
import { SVG_FONT_FAMILY, SVG_FONT_FILE } from "@senoy/media";

/**
 * Rough.js ships CommonJS with an ES-style typing, so under NodeNext the default import is typed as `{ default }`
 * while at runtime it is the module itself. Only the DOM-free generator is used.
 */
const rough = roughModule as unknown as { generator(): RoughGenerator };
import { bounds, limb, perimeter, resample, type Bounds, type Pt } from "./geometry.ts";
import { HEX } from "./palette.ts";

/** The fixed canvas every scene plan is laid out on. */
export const CANVAS = { width: 1200, height: 800 } as const;

/** The desk margin around the sheet; nothing a plan places should sit outside the sheet. */
export const SHEET_MARGIN = 22;

/** How one piece of paper is cut and glued. */
export type PieceOptions = {
  /** `#rrggbb` fill. */
  fill: string;
  /** Which scissor jitter; the same seed cuts the same edge every time. */
  seed: number;
  /** Shadow depth in canvas units; 0 is glued flat. Defaults to 3. */
  depth?: number;
  /** Strength of the lit top-left cut edge, 0 to 1. Defaults to 0.28. */
  rim?: number;
  /** How ragged the cut is. Defaults to 0.6. */
  roughness?: number;
  /** Facet length; by default it follows the outline's size. */
  step?: number;
  /** Fill opacity, for clear liquids. */
  opacity?: number;
};

/** Where text sits relative to its x. */
export type TextAnchor = "start" | "middle" | "end";

/** The average glyph width of the tag font as a share of its size, for sizing a tag around its text. */
const GLYPH_WIDTH = 0.52;

/** The size of the grain tile the fibre texture is baked into. Drawn once per process and tiled across the canvas. */
const GRAIN_TILE = 400;

/** The grain's opacity over the finished picture. */
const GRAIN_OPACITY = 0.16;

/** The fibre grain as a base64 PNG, once drawn. */
let grainTile: string | null = null;

/**
 * Escapes text for an SVG text node or attribute.
 * @param value - Raw text
 */
export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Draws the fibre grain once, as a seamless tile, and keeps it for every later render. The turbulence filters are the
 * slow part of a render, so baking them into one PNG is what brings a scene under a second.
 * @returns The tile as base64 PNG bytes
 * @throws Error when resvg cannot draw the tile
 */
export function grainTilePng(): string {
  if (grainTile) return grainTile;
  const size = GRAIN_TILE;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" stitchTiles="stitch" result="n1"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.02 0.33" numOctaves="2" seed="9" stitchTiles="stitch" result="n2"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.3 0.02" numOctaves="2" seed="17" stitchTiles="stitch" result="n3"/>` +
    `<feComposite in="n2" in2="n3" operator="arithmetic" k2="0.5" k3="0.5" result="fib"/>` +
    `<feComposite in="n1" in2="fib" operator="arithmetic" k2="0.45" k3="0.55" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1"/>` +
    `</filter><rect width="${size}" height="${size}" filter="url(#grain)"/></svg>`;
  try {
    grainTile = Buffer.from(new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng()).toString("base64");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[style.ts: grainTilePng] Failed to draw the paper grain || size=${size} || ${message}`);
  }
  return grainTile;
}

/**
 * The one style every shape goes through: a flat cut-paper fill with a slightly uneven scissor edge, a soft offset
 * drop shadow for its depth and a faint lit top-left edge, and a fibre paper grain over the finished sheet. There are
 * no outlines and no gradients; depth comes from stacking pieces.
 */
export class Style {
  private readonly generator = rough.generator();
  private readonly defs: string[] = [];
  private readonly body: string[] = [];
  private filterCount = 0;
  /** The box around every piece cut since {@link beginFootprint}, for the label placer to steer around. */
  private footprint: Bounds | null = null;

  constructor(readonly width: number = CANVAS.width, readonly height: number = CANVAS.height) {}

  /**
   * Cuts a closed outline out of paper and glues it down: Rough.js jitters the resampled facets, and an SVG filter
   * adds the shadow and the lit edge.
   * @param pts - The closed outline, at least three points
   * @param options - Fill, seed, depth and edge
   */
  piece(pts: Pt[], options: PieceOptions): void {
    const step = options.step ?? Math.max(2.5, Math.min(14, perimeter(pts) / 28));
    const facets = resample(pts, step);
    const drawable = this.generator.polygon(facets, {
      fill: options.fill,
      fillStyle: "solid",
      stroke: "none",
      seed: options.seed,
      roughness: options.roughness ?? 0.6,
      maxRandomnessOffset: Math.min(1.3, step / 7),
    });
    const d = this.generator.toPaths(drawable).map((path) => path.d).join(" ");
    const depth = options.depth ?? 3;
    const rim = options.rim ?? 0.28;
    this.grow(bounds(facets), depth);
    let filter = "";
    if (depth > 0 || rim > 0) {
      const id = `f${this.filterCount++}`;
      const b = bounds(facets);
      const m = 6 + depth * 3;
      const shadow = depth > 0
        ? `<feGaussianBlur in="SourceAlpha" stdDeviation="${(depth * 0.9).toFixed(2)}"/>` +
          `<feOffset dx="${(depth * 0.55).toFixed(2)}" dy="${(depth * 0.95).toFixed(2)}" result="b"/>` +
          `<feFlood flood-color="#03050b" flood-opacity="0.62"/><feComposite in2="b" operator="in" result="sh"/>`
        : "";
      const lit = rim > 0
        ? `<feOffset in="SourceAlpha" dx="1.3" dy="1.3" result="o"/>` +
          `<feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>` +
          `<feFlood flood-color="#fff6e6" flood-opacity="${rim.toFixed(2)}"/><feComposite in2="e" operator="in" result="rm"/>`
        : "";
      this.defs.push(
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="${(b.x0 - m).toFixed(1)}" y="${(b.y0 - m).toFixed(1)}" ` +
          `width="${(b.x1 - b.x0 + 2 * m + depth * 2).toFixed(1)}" height="${(b.y1 - b.y0 + 2 * m + depth * 2).toFixed(1)}" color-interpolation-filters="sRGB">` +
          shadow + lit +
          `<feMerge>${depth > 0 ? '<feMergeNode in="sh"/>' : ""}<feMergeNode in="SourceGraphic"/>${rim > 0 ? '<feMergeNode in="rm"/>' : ""}</feMerge></filter>`,
      );
      filter = ` filter="url(#${id})"`;
    }
    const opacity = options.opacity != null ? ` fill-opacity="${options.opacity}"` : "";
    this.body.push(`<path d="${d}" fill="${options.fill}"${opacity}${filter}/>`);
  }

  /**
   * A thin cut strip along a polyline: a vein, a belt, a pointer line.
   * @param line - The strip's centreline
   * @param width - The strip's width
   * @param options - Fill, seed and depth; the depth defaults to 1.2 and the edge to none
   */
  strip(line: Pt[], width: number, options: PieceOptions): void {
    this.piece(limb(line.map(([x, y]) => [x, y, width]), 4), { depth: 1.2, rim: 0, step: 5, ...options });
  }

  /**
   * Plain text with no paper under it. Tags and panels put paper down first.
   * @param x - Anchor x
   * @param y - Centre line y
   * @param value - The text
   * @param size - Font size
   * @param fill - `#rrggbb`
   * @param anchor - Where `x` sits on the text
   * @param weight - Font weight
   */
  text(x: number, y: number, value: string, size: number, fill: string = HEX.text, anchor: TextAnchor = "middle", weight = 700): void {
    const w = Style.textWidth(value, size);
    const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
    this.grow({ x0, y0: y - size * 0.6, x1: x0 + w, y1: y + size * 0.6 }, 0);
    this.body.push(
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${SVG_FONT_FAMILY}" font-size="${size}" font-weight="${weight}" ` +
        `fill="${fill}" text-anchor="${anchor}" dominant-baseline="central">${escapeXml(value)}</text>`,
    );
  }

  /**
   * How wide a line of text sets, for sizing paper around it.
   * @param value - The text
   * @param size - Font size
   */
  static textWidth(value: string, size: number): number {
    return value.length * size * GLYPH_WIDTH;
  }

  /**
   * Starts collecting the footprint of the pieces that follow, so a composite glyph can report where it landed.
   */
  beginFootprint(): void {
    this.footprint = null;
  }

  /**
   * The box around every piece cut since {@link beginFootprint}, or null when nothing was cut.
   */
  endFootprint(): Bounds | null {
    const footprint = this.footprint;
    this.footprint = null;
    return footprint;
  }

  /**
   * Widens the running footprint to hold a piece and its shadow.
   * @param b - The piece's box
   * @param depth - Its shadow depth
   */
  private grow(b: Bounds, depth: number): void {
    const grown = { x0: b.x0, y0: b.y0, x1: b.x1 + depth, y1: b.y1 + depth };
    if (!this.footprint) this.footprint = grown;
    else {
      this.footprint = {
        x0: Math.min(this.footprint.x0, grown.x0),
        y0: Math.min(this.footprint.y0, grown.y0),
        x1: Math.max(this.footprint.x1, grown.x1),
        y1: Math.max(this.footprint.y1, grown.y1),
      };
    }
  }

  /**
   * The finished sheet: the desk, every piece in the order it was cut, and the paper grain over it all. The only
   * reference in it is the grain tile as a data URI, so it passes the product's unsafe-SVG check.
   */
  svg(): string {
    const tile = grainTilePng();
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">` +
      `<defs>${this.defs.join("")}` +
      `<pattern id="grain" patternUnits="userSpaceOnUse" width="${GRAIN_TILE}" height="${GRAIN_TILE}">` +
      `<image href="data:image/png;base64,${tile}" width="${GRAIN_TILE}" height="${GRAIN_TILE}"/></pattern></defs>` +
      `<rect width="${this.width}" height="${this.height}" fill="${HEX.desk}"/>` +
      `<g>${this.body.join("")}</g>` +
      `<rect width="${this.width}" height="${this.height}" fill="url(#grain)" opacity="${GRAIN_OPACITY}" style="mix-blend-mode:overlay"/>` +
      `</svg>`
    );
  }
}

/**
 * Draws a finished sheet as a PNG at canvas size, with the committed tag font only, so the bytes are the same on
 * every machine.
 * @param svg - What {@link Style.svg} returned
 * @returns The PNG's bytes
 * @throws Error when resvg cannot draw it
 */
export function rasterize(svg: string): Uint8Array {
  try {
    const drawn = new Resvg(svg, {
      fitTo: { mode: "original" },
      font: { loadSystemFonts: false, fontFiles: [SVG_FONT_FILE], defaultFontFamily: SVG_FONT_FAMILY, sansSerifFamily: SVG_FONT_FAMILY },
    }).render();
    return new Uint8Array(drawn.asPng());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[style.ts: rasterize] Failed to draw a scene as PNG || svgLength=${svg.length} || ${message}`);
  }
}
