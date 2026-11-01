/*
 * SVG markup for the Knibbler mark (Jongi's head) and the course icons. Strings (not JSX) because the
 * favicon set in public/ is generated from the same markup (`pnpm brand:icons`, apps/web/scripts/brand-icons.mjs).
 */

/** The companion's name lives here only. */
export const COMPANION_NAME = "Jongi";

/** Product name (silent k). */
export const PRODUCT_NAME = "Knibbler";

/** The ink-navy tile the mark sits on at 32px and up (`--panel`). */
export const MARK_TILE_COLOUR = "#141a2e";

/**
 * Jongi's head on a 32×32 grid, without the `<svg>` wrapper: the raccoon's ears, grey fur with cheek tufts,
 * cream brows, the dark mask, cream muzzle, pink cheeks and nose, in the tilted scholar cap with a gold tassel.
 * Flat facets, no filters, so it stays crisp at 16px. Fixed paper colours sampled from the rendered frames.
 * The eyes are `.le` (the loader moves them as he reads) and the tassel is `.tassel` (it swings on hover).
 * The Loader draws the same head on its own artboard.
 */
export const MARK_HEAD = `<polygon points="3.8,13.5 5.6,3.4 11.8,9.2" fill="#8c8da3"/><polygon points="5.6,3.4 9.6,7.4 6.4,10.6" fill="#3a3d52"/>
<polygon points="28.2,13.5 26.4,3.4 20.2,9.2" fill="#6f7187"/><polygon points="26.4,3.4 22.4,7.4 25.6,10.6" fill="#2c2f42"/>
<polygon points="16,7 24.6,9 27.8,14.6 31,18.6 27,20.4 25.6,25.2 16,29 6.4,25.2 5,20.4 1,18.6 4.2,14.6 7.4,9" fill="#8c8da3"/>
<polygon points="16,7 24.6,9 27.8,14.6 31,18.6 27,20.4 25.6,25.2 16,29" fill="#777990"/>
<polygon points="8.6,13 13,11.8 13.6,13.4 9.4,14.4" fill="#eadcc1"/><polygon points="23.4,13 19,11.8 18.4,13.4 22.6,14.4" fill="#d9c9aa"/>
<polygon points="3.6,17.6 8.4,14.8 13.4,15.4 16,17.4 18.6,15.4 23.6,14.8 28.4,17.6 25.4,20.6 19.6,20.2 16,19 12.4,20.2 6.6,20.6" fill="#292b3a"/>
<polygon points="16,18.8 20.8,20 24,23 21.4,26.8 16,28.8 10.6,26.8 8,23 11.2,20" fill="#eadcc1"/>
<polygon points="16,18.8 20.8,20 24,23 21.4,26.8 16,28.8" fill="#d9c9aa"/>
<g class="le"><circle cx="10.6" cy="17.4" r="1.6" fill="#0f1019"/><circle cx="21.4" cy="17.4" r="1.6" fill="#0f1019"/>
<circle cx="10.1" cy="16.8" r=".7" fill="#fff4e2"/><circle cx="20.9" cy="16.8" r=".7" fill="#fff4e2"/></g>
<ellipse cx="9.2" cy="23.2" rx="1.6" ry="1" fill="#db6f64"/><ellipse cx="22.8" cy="23.2" rx="1.6" ry="1" fill="#c9645b"/>
<polygon points="14.6,20.4 17.4,20.4 16,22" fill="#141726"/>
<g transform="rotate(6 16 7)"><polygon points="8.5,6.6 16.4,3 24,5.8 16,9.6" fill="#2f3964"/><polygon points="16.4,3 24,5.8 16,9.6" fill="#222949"/>
<polyline points="8.5,6.6 16.4,3 24,5.8" fill="none" stroke="#6372b3" stroke-width=".7" stroke-linejoin="round"/>
<path d="M16.2,6.3 L23.6,6" fill="none" stroke="#e7b250" stroke-width="1" stroke-linecap="round"/>
<g class="tassel"><path d="M23.6,6 L23.6,9.8" fill="none" stroke="#e7b250" stroke-width="1" stroke-linecap="round"/><polygon points="22.9,9.4 24.3,9.4 24.7,11.8 22.5,11.8" fill="#e7b250"/></g></g>`;

/**
 * The mark: {@link MARK_HEAD} in a 32×32 SVG.
 * @param options.tile - Sit on the rounded ink-navy tile (use at 32px and up, and for the favicon)
 */
export function logoMarkup({ tile = false }: { tile?: boolean } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">${tile ? `<rect width="32" height="32" rx="7" fill="${MARK_TILE_COLOUR}"/>` : ""}
${MARK_HEAD}</svg>`;
}

/**
 * The home-screen icon (apple-touch-icon, manifest icons): a square full-bleed tile, because the platform
 * rounds or masks the corners itself, with the mark shrunk into the maskable safe zone (the centre 80%).
 */
export function appIconMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${MARK_TILE_COLOUR}"/>
<g transform="translate(5.6 5.6) scale(.65)">${MARK_HEAD}</g></svg>`;
}

/**
 * Course icons, 24px grid, stroke style. Keys are stable names stored per Course later
 * (the plan step will pick from a licensed library; see docs/uis/redesign/08-course-icons.md).
 */
export const COURSE_ICON_PATHS = {
  norse:
    '<path d="M5 3.5h14l2 2v5l-2 2H5l-2-2v-5z"/><path d="M7.5 3.5v9M16.5 3.5v9"/><path d="M10.7 12.5v6.6h2.6v-6.6"/><path d="M10.7 15l2.6-1.1M10.7 17.4l2.6-1.1"/><circle cx="12" cy="20.9" r="1.4"/>',
  knot: '<path d="M7 3.5l5 2.8 5-2.8"/><path d="M10 6.3h4l-.9 2.6h-2.2z"/><path d="M10.9 8.9L9 17.4l3 3.4 3-3.4-1.9-8.5"/>',
  greek:
    '<path d="M3.5 4h17"/><path d="M5 4.2c0 2.4 1.4 3.3 2.6 3.3a1.3 1.3 0 0 0 0-2.6M19 4.2c0 2.4-1.4 3.3-2.6 3.3a1.3 1.3 0 0 1 0-2.6"/><path d="M7.6 7.5h8.8"/><path d="M8.5 8.5v9.5M12 8.5v9.5M15.5 8.5v9.5"/><path d="M6.5 18.2h11M5 21h14"/>',
  music:
    '<path d="M9 17.5V5.5l11-2.2v12"/><path d="M9 9.2l11-2.2"/><ellipse cx="6.5" cy="17.6" rx="2.6" ry="2.1"/><ellipse cx="17.5" cy="15.4" rx="2.6" ry="2.1"/>',
  yggdrasil:
    '<path d="M12 2.8c2.6 0 4.6 1.8 4.9 4.1a3.4 3.4 0 0 1-.6 6.6H7.7a3.4 3.4 0 0 1-.6-6.6C7.4 4.6 9.4 2.8 12 2.8z"/><path d="M12 13.5v5.3M12 11.2l-2.2-2M12 10.4l2-1.7"/><path d="M12 18.8c-1.2 0-2.6.8-4.6 2.4M12 18.8c1.2 0 2.6.8 4.6 2.4M12 18.8v2.6"/>',
  sourdough:
    '<path d="M3.5 15.2C3.5 10 7.3 7 12 7s8.5 3 8.5 8.2v1.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z"/><path d="M7.6 12.6l1.8-2.1M11.1 12.2l1.8-2.3M14.6 12.6l1.8-2.1"/>',
  investing: '<circle cx="12" cy="12" r="9"/><path d="M7.2 15.2l3-3 2.2 2 4.2-4.6"/><path d="M14 9.4h2.8v2.8"/>',
  microscope:
    '<path d="M9 3.5h4l-1 7h-2z"/><path d="M8 10.5h6"/><path d="M11 10.5v3"/><path d="M15.5 9.5a6 6 0 0 1-3 10.5"/><path d="M5 20.5h14"/><path d="M8 17.5h5"/>',
  drum: '<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/><path d="M7.5 10.6l2.5 8M16.5 10.6l-2.5 8"/><path d="M15 2.5l-4.5 4M19.5 3.5l-6 4"/>',
  generic: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/>',
} as const;

export type CourseIconName = keyof typeof COURSE_ICON_PATHS;

const ICON_HINTS: [CourseIconName, RegExp][] = [
  ["norse", /norse|viking|thor|odin|loki|asgard|edda|ragnar/i],
  ["yggdrasil", /yggdrasil|world tree|nine worlds|tree|forest|botan/i],
  ["greek", /greek|greece|roman|rome|zeus|olymp|athens|antiquity|philosoph/i],
  ["knot", /knot|tie|rope|sailing/i],
  ["music", /music|sheet|piano|guitar|song|rhythm|melody|chord/i],
  ["drum", /drum|percussion|beat/i],
  ["sourdough", /sourdough|bread|bak|cook|ferment|kitchen|recipe/i],
  ["investing", /invest|stock|finance|money|budget|econom/i],
  ["microscope", /micro|biolog|lab|cell|bacteri|chemist|science/i],
];

/**
 * Placeholder icon choice from the subject text. The real choice comes from the plan step (follow-up).
 * @param subject - Course title or subject
 */
export function pickCourseIcon(subject: string): CourseIconName {
  return ICON_HINTS.find(([, pattern]) => pattern.test(subject))?.[0] ?? "generic";
}
