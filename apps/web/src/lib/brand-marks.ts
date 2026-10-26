/*
 * SVG markup for the Knibbler mark, the old capped companion still used by the loader, and the course icons.
 * The mark is ported from docs/uis/redesign/10-papercraft-jongi.html (`logo()`). Strings (not JSX) because
 * the favicon (public/jongi-logo.svg) is the same markup.
 */

/** The companion's name lives here only. */
export const COMPANION_NAME = "Jongi";

/** Product name (silent k). */
export const PRODUCT_NAME = "Knibbler";

/**
 * The mark: Jongi's folded paper head (ears, face, cream muzzle, nose) in a tilted scholar cap with a
 * gold tassel. Flat facets, no filters, so it stays crisp at 16px. Fixed paper colours (one palette).
 * @param options.tile - Sit on the rounded ink-navy tile (use at 32px and up, and for the favicon)
 */
export function logoMarkup({ tile = false }: { tile?: boolean } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">${tile ? '<rect width="32" height="32" rx="7" fill="#141a2e"/>' : ""}
<polygon points="3.5,14 5.2,3.2 10.5,10.8" fill="#e8b07a"/><polygon points="5.2,3.2 13.5,8.6 10.5,10.8" fill="#c27f48"/>
<polygon points="28.5,14 26.8,3.2 21.5,10.8" fill="#b06f3c"/><polygon points="26.8,3.2 18.5,8.6 21.5,10.8" fill="#d08b55"/>
<polygon points="16,6.5 24.6,8.9 28.6,16.6 25.6,25 16,28.8 6.4,25 3.4,16.6 7.4,8.9" fill="#d8955c"/>
<polygon points="16,6.5 24.6,8.9 28.6,16.6 25.6,25 16,28.8" fill="#c4824c"/>
<polygon points="16,18 22.8,21 21,26 16,28.8 11,26 9.2,21" fill="#f0e0c2"/><polygon points="16,18 22.8,21 21,26 16,28.8" fill="#d9c39d"/>
<circle cx="11.4" cy="15.4" r="1.75" fill="#141726"/><circle cx="20.6" cy="15.4" r="1.75" fill="#141726"/>
<polygon points="14.8,19.6 17.2,19.6 16,21.1" fill="#c25f72"/>
<g transform="rotate(6 16 7)"><polygon points="8.5,6.6 16.4,3 24,5.8 16,9.6" fill="#2f3964"/><polygon points="16.4,3 24,5.8 16,9.6" fill="#222949"/>
<polyline points="8.5,6.6 16.4,3 24,5.8" fill="none" stroke="#6372b3" stroke-width=".7" stroke-linejoin="round"/>
<path d="M16.2,6.3 L23.6,6 L23.6,10.4" fill="none" stroke="#e7b250" stroke-width="1" stroke-linecap="round"/></g></svg>`;
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
