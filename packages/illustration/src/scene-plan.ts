/**
 * The scene plan: the closed set of cut-paper building blocks an illustrator model fills in from a `VisualBrief`
 * (SEN-128), which the renderer draws in the house style. It is the contract every illustrator prompt depends on.
 *
 * The shape is written once, as the strict JSON Schema below (every property required, no extra properties, null
 * instead of missing, no open maps), which is what the model answers in; {@link scenePlanFailures} checks a reply
 * against that same schema and then against the rules the schema cannot say (inside the canvas, enough points, sane
 * counts). The TypeScript types mirror the schema for the renderer.
 */
import { PAPER_COLOURS, type PaperColour } from "./palette.ts";
import { CANVAS, CARD_INSET } from "./style.ts";

/** A point on the canvas, in canvas units from the top-left. */
export type Point = { x: number; y: number };

/** An axis-aligned box: its top-left corner and size. */
export type Box = { x: number; y: number; w: number; h: number };

/** A point on a limb's centreline and the limb's width there. */
export type LimbKnot = { x: number; y: number; width: number };

/** How far a piece stands off the sheet. */
export type Depth = "flat" | "low" | "raised";

/** The named cuts a `shape` block can be. `band` is a ground: the sheet's width from `box.y` down, with a wavy top. */
export const SHAPE_KINDS = ["rect", "rounded", "ellipse", "triangle", "blob", "band"] as const;

/** One of {@link SHAPE_KINDS}. */
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** The small objects the renderer knows how to cut. */
export const OBJECT_KINDS = ["bottle", "drop", "slide", "well"] as const;

/** One of {@link OBJECT_KINDS}. */
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** The creatures the renderer knows how to cut. */
export const CREATURE_KINDS = ["bird", "serpent", "squirrel"] as const;

/** One of {@link CREATURE_KINDS}. */
export type CreatureKind = (typeof CREATURE_KINDS)[number];

/** Jongi's cut-paper poses. */
export const JONGI_POSES = ["pointing", "sign", "thinking"] as const;

/** One of {@link JONGI_POSES}. */
export type JongiPose = (typeof JONGI_POSES)[number];

/** Which way a creature or Jongi looks. */
export type Facing = "left" | "right";

/** Where a label would rather sit; the placer decides. */
export type LabelSide = "left" | "right" | "above" | "below";

/** A free paper cut in a box. */
export type ShapeItem = { type: "shape"; shape: ShapeKind; box: Box; colour: PaperColour; depth: Depth };

/** A free paper cut along its own outline. */
export type CutoutItem = { type: "cutout"; points: Point[]; colour: PaperColour; depth: Depth };

/** A tapered limb along a centreline: a root, a branch, a neck, an arm, a river. */
export type LimbItem = { type: "limb"; knots: LimbKnot[]; colour: PaperColour; depth: Depth };

/** Clumped leaves filling a box, dark clumps behind lit ones. */
export type FoliageItem = { type: "foliage"; box: Box; colour: PaperColour; shade: PaperColour };

/** A whole tree in a box: crown, trunk, branches and exactly `roots` roots reaching the bottom of the box. */
export type TreeItem = { type: "tree"; box: Box; roots: number; crown: "wide" | "round" | "narrow"; leaves: PaperColour; wood: PaperColour };

/** A simple standing person, feet at (x, y), with no hands. */
export type FigureItem = { type: "figure"; x: number; y: number; height: number; clothes: PaperColour; hair: PaperColour; skin: PaperColour };

/** A creature fitted into a box, looking left or right. */
export type CreatureItem = { type: "creature"; kind: CreatureKind; box: Box; colour: PaperColour; accent: PaperColour; facing: Facing };

/** A small object fitted into a box. `colour` is the liquid of a bottle or drop, the water of a well, the glass of a slide. */
export type ObjectItem = { type: "object"; kind: ObjectKind; box: Box; colour: PaperColour; label: string | null };

/** A cluster of cells filling a box: round cocci or rods. */
export type CellsItem = { type: "cells"; form: "cocci" | "rods"; box: Box; colour: PaperColour; count: number };

/** A numbered disc, for the steps of a process. */
export type DiscItem = { type: "disc"; x: number; y: number; number: number; colour: PaperColour };

/** A cut-paper arrow. */
export type ArrowItem = { type: "arrow"; from: Point; to: Point; colour: PaperColour };

/** A line of text with no paper under it. */
export type TextItem = { type: "text"; x: number; y: number; text: string; size: "small" | "medium" | "large"; colour: PaperColour; align: "start" | "middle" | "end" };

/** A raised paper panel, with a title set inside its top when given. */
export type PanelItem = { type: "panel"; box: Box; colour: PaperColour; title: string | null };

/** Jongi, the companion, feet at (x, y). Drawn from the Blender poses once they exist; a marked placeholder until then. */
export type JongiItem = { type: "jongi"; pose: JongiPose; x: number; y: number; height: number; facing: Facing; signText: string | null };

/** One building block. Blocks are drawn in order, so later ones lie on top. */
export type SceneItem =
  | ShapeItem | CutoutItem | LimbItem | FoliageItem | TreeItem | FigureItem | CreatureItem
  | ObjectItem | CellsItem | DiscItem | ArrowItem | TextItem | PanelItem | JongiItem;

/** A label tag with a pointer to its target; the placer picks where the tag sits. */
export type SceneLabel = { text: string; target: Point; side: LabelSide | null };

/** A whole scene: a title across the top when given, the blocks back to front, and the labels placed last. */
export type ScenePlan = { title: string | null; items: SceneItem[]; labels: SceneLabel[] };

/** The most blocks one scene may hold. */
export const MAX_ITEMS = 120;

/** The most labels one scene may hold; more than this cannot be placed readably. */
export const MAX_LABELS = 16;

/** The longest text a block or label may carry. */
export const MAX_TEXT_LENGTH = 60;

/** The most roots a tree may have. */
export const MAX_ROOTS = 6;

/** The most cells a cluster may hold. */
export const MAX_CELLS = 40;

/** The most points a cutout, and the most knots a limb, may have. */
export const MAX_POINTS = 40;

/**
 * The area a plan may place things in: the raised card the renderer draws on the sheet, so a panel or band laid at
 * its edge sits on the card rather than hanging over it.
 */
export const SHEET = { x0: CARD_INSET.x, y0: CARD_INSET.y, x1: CANVAS.width - CARD_INSET.x, y1: CANVAS.height - CARD_INSET.y } as const;

/**
 * The box a tree's crown fills: across the top of the tree's box, as wide as its crown kind allows. The renderer draws
 * the crown here, and the validator keeps model-drawn limbs from lying over it.
 * @param tree - The tree block
 */
export function crownBoxOf(tree: TreeItem): Box {
  const { x, y, w, h } = tree.box;
  const crownW = tree.crown === "wide" ? w : tree.crown === "round" ? w * 0.72 : w * 0.5;
  const crownH = tree.crown === "narrow" ? h * 0.62 : h * 0.52;
  return { x: x + w / 2 - crownW / 2, y, w: crownW, h: crownH };
}

const colour = (what: string) => ({ type: "string", enum: [...PAPER_COLOURS], description: what });
const depth = { type: "string", enum: ["flat", "low", "raised"], description: "How far the piece stands off the sheet." };
const point = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } };
const box = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "w", "h"],
  properties: { x: { type: "number", description: "Left edge." }, y: { type: "number", description: "Top edge." }, w: { type: "number" }, h: { type: "number" } },
  description: "The box the piece fills, from its top-left corner.",
};
const block = (type: string, description: string, properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: ["type", ...Object.keys(properties)],
  properties: { type: { type: "string", enum: [type] }, ...properties },
  description,
});

/**
 * The scene plan as an OpenAI strict structured-output schema: every property required, no extra properties, null
 * instead of missing, and a closed `anyOf` of blocks told apart by `type`. Coordinates are canvas units on a
 * 1200 x 800 sheet whose usable area is the raised card, 44..1156 by 40..760; the renderer draws the sheet itself.
 */
export const SCENE_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "items", "labels"],
  description: `A cut-paper scene on a ${CANVAS.width} x ${CANVAS.height} sheet. Place everything inside x ${SHEET.x0}..${SHEET.x1}, y ${SHEET.y0}..${SHEET.y1}. Blocks are drawn in order, so put backgrounds first and what lies on top last. Name colours from the palette; never describe a colour in words.`,
  properties: {
    title: { type: ["string", "null"], description: "A short title set across the top of the sheet, or null for none." },
    items: {
      type: "array",
      description: `The blocks, back to front, at most ${MAX_ITEMS}.`,
      items: {
        anyOf: [
          block("shape", "A paper cut of a named shape filling a box. 'band' is ground: the sheet's width from the box's top down, with a wavy top edge.", {
            shape: { type: "string", enum: [...SHAPE_KINDS] }, box, colour: colour("The paper colour."), depth,
          }),
          block("cutout", "A free paper cut along its own closed outline, for anything no other block gives.", {
            points: { type: "array", items: point, description: `3 to ${MAX_POINTS} outline points in order.` }, colour: colour("The paper colour."), depth,
          }),
          block("limb", "A tapered limb along a centreline: a root, a branch, a neck, a tail, a river. Each knot gives the width there.", {
            knots: {
              type: "array",
              description: `2 to ${MAX_POINTS} knots from one end to the other.`,
              items: { type: "object", additionalProperties: false, required: ["x", "y", "width"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" } } },
            },
            colour: colour("The paper colour."),
            depth,
          }),
          block("foliage", "Clumped leaves filling a box: dark clumps behind, lit clumps in front.", {
            box, colour: colour("The lit leaf colour."), shade: colour("The colour of the clumps behind."),
          }),
          block("tree", "A whole tree in a box: crown across the top, trunk in the middle, exactly `roots` roots reaching the box's bottom.", {
            box, roots: { type: "integer", description: `1 to ${MAX_ROOTS}.` }, crown: { type: "string", enum: ["wide", "round", "narrow"] },
            leaves: colour("The leaf colour."), wood: colour("The trunk and root colour."),
          }),
          block("figure", "A simple standing person seen from the front, with no hands: feet at (x, y), `height` tall.", {
            x: { type: "number" }, y: { type: "number", description: "The feet line." }, height: { type: "number" },
            clothes: colour("The clothes colour."), hair: colour("The hair colour."), skin: colour("The skin colour: skin or skin-deep."),
          }),
          block("creature", "A creature fitted into a box, facing left or right: a bird with spread wings, a coiling serpent with open jaws at its facing end, or a squirrel.", {
            kind: { type: "string", enum: [...CREATURE_KINDS] }, box, colour: colour("The body colour."), accent: colour("The colour of its markings, beak, spines or tail."), facing: { type: "string", enum: ["left", "right"] },
          }),
          block("object", "A small object fitted into a box: a dropper bottle (colour is its liquid, label its sticker), a falling drop, a glass slide, or a stone well of water.", {
            kind: { type: "string", enum: [...OBJECT_KINDS] }, box, colour: colour("The liquid, water or glass colour."), label: { type: ["string", "null"], description: "Short text on a bottle's sticker; null elsewhere." },
          }),
          block("cells", "A cluster of cells filling a box: round cocci or rods, `count` of them.", {
            form: { type: "string", enum: ["cocci", "rods"] }, box, colour: colour("The cell colour."), count: { type: "integer", description: `1 to ${MAX_CELLS}.` },
          }),
          block("disc", "A numbered disc centred at (x, y), for the steps of a process.", {
            x: { type: "number" }, y: { type: "number" }, number: { type: "integer" }, colour: colour("The disc colour; the number is cream."),
          }),
          block("arrow", "A cut-paper arrow from one point to another.", {
            from: point, to: point, colour: colour("The arrow colour."),
          }),
          block("text", "A line of text with no paper under it; use a label for anything that points at something.", {
            x: { type: "number" }, y: { type: "number", description: "The text's centre line." }, text: { type: "string" },
            size: { type: "string", enum: ["small", "medium", "large"] }, colour: colour("The text colour."), align: { type: "string", enum: ["start", "middle", "end"] },
          }),
          block("panel", "A raised paper panel, with a title set inside its top when given. Put the blocks it holds after it.", {
            box, colour: colour("The panel colour."), title: { type: ["string", "null"] },
          }),
          block("jongi", "Jongi, the raccoon companion, feet at (x, y): pointing, holding a sign, or thinking.", {
            pose: { type: "string", enum: [...JONGI_POSES] }, x: { type: "number" }, y: { type: "number", description: "The feet line." }, height: { type: "number" },
            facing: { type: "string", enum: ["left", "right"] }, signText: { type: ["string", "null"], description: "What the sign says; null unless the pose is sign." },
          }),
        ],
      },
    },
    labels: {
      type: "array",
      description: `Tags with pointer lines, placed automatically so they overlap nothing; at most ${MAX_LABELS}.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "target", "side"],
        properties: {
          text: { type: "string" },
          target: { ...point, description: "The point the tag points at." },
          side: { type: ["string", "null"], enum: ["left", "right", "above", "below", null], description: "Which side of the target the tag would rather sit, or null to let the placer choose." },
        },
      },
    },
  },
} as const;

/** The subset of JSON Schema the plan schema uses. */
type Schema = {
  type?: string | readonly string[];
  enum?: readonly (string | number | null)[];
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: Schema;
  anyOf?: readonly Schema[];
};

/**
 * Whether a value has a JSON Schema primitive type.
 * @param value - Any JSON
 * @param type - `string`, `number`, `integer`, `boolean`, `null`, `object` or `array`
 */
function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "object": return !!value && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    default: return false;
  }
}

/**
 * Checks a value against the subset of JSON Schema the plan schema uses, in plain language. A block that names an
 * unknown `type` is reported as such; one that names a known type is checked against that block alone, so the
 * failure says which field is wrong.
 * @param schema - The schema or a part of it
 * @param value - The value to check
 * @param path - Where `value` sits in the plan, for the message
 * @param failures - Collects every problem
 */
function schemaFailures(schema: Schema, value: unknown, path: string, failures: string[]): void {
  if (schema.anyOf) {
    const named = hasType(value, "object") ? (value as Record<string, unknown>).type : undefined;
    const branch = schema.anyOf.find((option) => option.properties?.type?.enum?.includes(named as string));
    if (!branch) {
      const known = schema.anyOf.map((option) => option.properties?.type?.enum?.[0]).join(", ");
      failures.push(`${path} is not a known block: its type is ${JSON.stringify(named)}; known types are ${known}.`);
      return;
    }
    schemaFailures(branch, value, path, failures);
    return;
  }
  const types = typeof schema.type === "string" ? [schema.type] : schema.type ?? [];
  if (types.length > 0 && !types.some((type) => hasType(value, type))) {
    failures.push(`${path} must be ${types.join(" or ")}, not ${describe(value)}.`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value as string)) {
    failures.push(`${path} must be one of ${schema.enum.filter((option) => option !== null).map((option) => JSON.stringify(option)).join(", ")}${schema.enum.includes(null) ? " or null" : ""}, not ${JSON.stringify(value)}.`);
    return;
  }
  if (schema.properties && hasType(value, "object")) {
    const row = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in row)) failures.push(`${path}.${key} is missing.`);
    }
    for (const key of Object.keys(row)) {
      if (!(key in schema.properties)) failures.push(`${path}.${key} is not a field this block has.`);
      else if (key in row) schemaFailures(schema.properties[key], row[key], `${path}.${key}`, failures);
    }
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((entry, index) => schemaFailures(schema.items!, entry, `${path}[${index}]`, failures));
  }
}

/**
 * A short description of a value's type for a failure message.
 * @param value - Any JSON
 */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "number" && !Number.isFinite(value)) return "a non-finite number";
  return typeof value === "object" ? "an object" : `${typeof value} ${JSON.stringify(value)}`;
}

/**
 * Whether a point lies on the sheet.
 * @param p - The point
 */
function onSheet(p: Point): boolean {
  return p.x >= SHEET.x0 && p.x <= SHEET.x1 && p.y >= SHEET.y0 && p.y <= SHEET.y1;
}

/**
 * Whether a box lies on the sheet with a positive size.
 * @param b - The box
 */
function boxOnSheet(b: Box): boolean {
  return b.w > 0 && b.h > 0 && onSheet({ x: b.x, y: b.y }) && onSheet({ x: b.x + b.w, y: b.y + b.h });
}

/**
 * The rules the schema cannot say about one block, in plain language.
 * @param item - A block that passed the schema
 * @param path - Where it sits in the plan
 * @param failures - Collects every problem
 */
function itemFailures(item: SceneItem, path: string, failures: string[]): void {
  const off = (what: string) => failures.push(`${path} (${item.type}) ${what} must lie on the sheet, x ${SHEET.x0}..${SHEET.x1} and y ${SHEET.y0}..${SHEET.y1}, with a positive size.`);
  const text = (value: string, what: string) => {
    if (!value.trim()) failures.push(`${path} (${item.type}) ${what} is empty.`);
    else if (value.length > MAX_TEXT_LENGTH) failures.push(`${path} (${item.type}) ${what} is longer than ${MAX_TEXT_LENGTH} characters.`);
  };
  switch (item.type) {
    case "shape":
    case "foliage":
    case "panel":
      if (!boxOnSheet(item.box)) off("box");
      if (item.type === "panel" && item.title !== null) text(item.title, "title");
      break;
    case "tree":
      if (!boxOnSheet(item.box)) off("box");
      if (item.roots < 1 || item.roots > MAX_ROOTS) failures.push(`${path} (tree) roots must be 1 to ${MAX_ROOTS}, not ${item.roots}.`);
      break;
    case "creature":
      if (!boxOnSheet(item.box)) off("box");
      break;
    case "object":
      if (!boxOnSheet(item.box)) off("box");
      if (item.label !== null) text(item.label, "label");
      break;
    case "cells":
      if (!boxOnSheet(item.box)) off("box");
      if (item.count < 1 || item.count > MAX_CELLS) failures.push(`${path} (cells) count must be 1 to ${MAX_CELLS}, not ${item.count}.`);
      break;
    case "cutout":
      if (item.points.length < 3 || item.points.length > MAX_POINTS) failures.push(`${path} (cutout) needs 3 to ${MAX_POINTS} points, not ${item.points.length}.`);
      if (!item.points.every(onSheet)) off("every point");
      break;
    case "limb":
      if (item.knots.length < 2 || item.knots.length > MAX_POINTS) failures.push(`${path} (limb) needs 2 to ${MAX_POINTS} knots, not ${item.knots.length}.`);
      if (!item.knots.every(onSheet)) off("every knot");
      if (item.knots.some((knot) => knot.width <= 0)) failures.push(`${path} (limb) every knot width must be positive.`);
      break;
    case "figure":
    case "jongi":
      if (item.height <= 0 || !onSheet({ x: item.x, y: item.y }) || !onSheet({ x: item.x, y: item.y - item.height })) off("feet and head");
      if (item.type === "jongi" && item.signText !== null) text(item.signText, "signText");
      break;
    case "disc":
      if (!onSheet({ x: item.x, y: item.y })) off("centre");
      if (item.number < 0 || item.number > 99) failures.push(`${path} (disc) number must be 0 to 99, not ${item.number}.`);
      break;
    case "arrow":
      if (!onSheet(item.from) || !onSheet(item.to)) off("ends");
      else if (Math.hypot(item.to.x - item.from.x, item.to.y - item.from.y) < 20) failures.push(`${path} (arrow) is shorter than 20 units.`);
      break;
    case "text":
      if (!onSheet({ x: item.x, y: item.y })) off("anchor");
      text(item.text, "text");
      break;
  }
}

/**
 * Whether a point lies inside a box.
 * @param p - The point
 * @param b - The box
 */
function inBox(p: Point, b: Box): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/**
 * The draw-order rule for limbs: a limb drawn after a tree or a foliage block, with a knot inside that block's crown,
 * would lie on top of the leaves, where a branch or a trunk never reads right. Blocks are drawn in order, so the fix
 * is to put the limb before the crown, which then covers it where they overlap. Reported once per limb.
 * @param items - Every block of the plan, in draw order
 * @param index - The block to check; anything but a limb passes
 * @param failures - Collects every problem
 */
function limbOverCrownFailure(items: readonly SceneItem[], index: number, failures: string[]): void {
  const item = items[index]!;
  if (item.type !== "limb") return;
  for (let at = 0; at < index; at++) {
    const earlier = items[at]!;
    const crown = earlier.type === "tree" ? crownBoxOf(earlier) : earlier.type === "foliage" ? earlier.box : null;
    if (crown && item.knots.some((knot) => inBox(knot, crown))) {
      failures.push(`plan.items[${index}] (limb) has a knot inside the crown of plan.items[${at}] (${earlier.type}), which is drawn before it, so it would lie on top of the leaves; put the limb before that block so the leaves cover it, or keep it out of the crown.`);
      return;
    }
  }
}

/**
 * Every problem with a scene plan, in plain language: first where it departs from the schema, then where it breaks
 * the rules the schema cannot say (on the sheet, enough points, sane counts, text present and short, no limb drawn
 * over a crown). Empty when the plan can be drawn.
 * @param raw - A model's reply, parsed from JSON
 */
export function scenePlanFailures(raw: unknown): string[] {
  const failures: string[] = [];
  schemaFailures(SCENE_PLAN_SCHEMA as unknown as Schema, raw, "plan", failures);
  if (failures.length > 0) return failures;
  const plan = raw as ScenePlan;
  if (plan.title !== null && !plan.title.trim()) failures.push("plan.title is empty; use null for no title.");
  if (plan.title !== null && plan.title.length > MAX_TEXT_LENGTH) failures.push(`plan.title is longer than ${MAX_TEXT_LENGTH} characters.`);
  if (plan.items.length === 0) failures.push("plan.items is empty; a scene needs at least one block.");
  if (plan.items.length > MAX_ITEMS) failures.push(`plan.items holds ${plan.items.length} blocks; the most is ${MAX_ITEMS}.`);
  if (plan.labels.length > MAX_LABELS) failures.push(`plan.labels holds ${plan.labels.length} labels; the most is ${MAX_LABELS}.`);
  plan.items.forEach((item, index) => itemFailures(item, `plan.items[${index}]`, failures));
  plan.items.forEach((item, index) => limbOverCrownFailure(plan.items, index, failures));
  plan.labels.forEach((label, index) => {
    if (!label.text.trim()) failures.push(`plan.labels[${index}].text is empty.`);
    else if (label.text.length > MAX_TEXT_LENGTH) failures.push(`plan.labels[${index}].text is longer than ${MAX_TEXT_LENGTH} characters.`);
    if (!onSheet(label.target)) failures.push(`plan.labels[${index}].target must lie on the sheet.`);
  });
  return failures;
}

/**
 * Reads a scene plan out of a model's reply, or refuses it with every problem named.
 * @param raw - The reply, parsed from JSON
 * @returns The plan, ready to render
 * @throws Error listing every failure when the plan cannot be drawn
 */
export function parseScenePlan(raw: unknown): ScenePlan {
  const failures = scenePlanFailures(raw);
  if (failures.length > 0) {
    throw new Error(`[scene-plan.ts: parseScenePlan] The scene plan cannot be drawn || failures=${failures.length} || ${failures.join(" ")}`);
  }
  return raw as ScenePlan;
}
