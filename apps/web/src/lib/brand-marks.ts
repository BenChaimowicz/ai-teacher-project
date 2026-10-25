/*
 * SVG markup for the Knibbler mark, the capped Nibbles used by the loader, and the course icons.
 * Ported from docs/uis/redesign/kit.js. Strings (not JSX) because the favicon needs the same
 * markup as a data URI. Colours are CSS var() strings inline, or hex for the favicon.
 */

/** The companion's name lives here only. It may change. */
export const COMPANION_NAME = "Nibbles";

/** Product name (silent k). */
export const PRODUCT_NAME = "Knibbler";

type MarkColours = { a: string; b: string };
type NibblesColours = MarkColours & { hi: string; lo: string; ear: string };

const MARK_VARS: MarkColours = { a: "var(--a)", b: "var(--b)" };
const NIBBLES_VARS: NibblesColours = { ...MARK_VARS, hi: "var(--nib-hi)", lo: "var(--nib-lo)", ear: "var(--nib-ear)" };

/**
 * The mark: Nibbles' silhouette (head, ears, cheeks) in a graduation cap. No face, so it stays crisp at 16px.
 * @param colours - Accent pair as var() strings or hex
 * @param uid - Unique id prefix for gradients and the mask
 */
export function logoMarkup(colours: MarkColours = MARK_VARS, uid = "lg") {
  const board = "M50 7 L95 21.5 L50 36 L5 21.5Z";
  const band = "M29 25 L71 25 L71 39.5 Q50 33.5 29 39.5Z";
  const cord = "M94 22.5 V40";
  const tassel = "M89.8 38.5 h8.4 l1.6 11 h-11.6z";
  const head =
    "M50 33 C64 33 75 40 79 50 C89 55 94 67 89 79 C84 91 69 97 50 97 C31 97 16 91 11 79 C6 67 11 55 21 50 C25 40 36 33 50 33Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="${uid}h" gradientUnits="userSpaceOnUse" x1="18" y1="30" x2="80" y2="98"><stop offset="0" style="stop-color:${colours.a}"/><stop offset="1" style="stop-color:${colours.b}"/></linearGradient>
    <linearGradient id="${uid}c" gradientUnits="userSpaceOnUse" x1="5" y1="8" x2="95" y2="54"><stop offset="0" style="stop-color:${colours.a}"/><stop offset="1" style="stop-color:${colours.b}"/></linearGradient>
    <mask id="${uid}m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect width="100" height="100" fill="#fff"/>
      <g style="fill:#000;stroke:#000" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
        <path d="${board}"/><path d="${band}"/><path d="${tassel}"/><path d="${cord}" fill="none"/>
      </g>
    </mask>
  </defs>
  <g mask="url(#${uid}m)" style="fill:url(#${uid}h)">
    <circle cx="22" cy="41" r="11"/><circle cx="78" cy="41" r="11"/>
    <path d="${head}"/>
  </g>
  <g>
    <path d="${band}" style="fill:url(#${uid}c)"/>
    <path d="${band}" style="fill:#000" opacity=".28"/>
    <path d="${board}" style="fill:url(#${uid}c)"/>
    <g class="tassel">
      <path d="${cord}" style="stroke:${colours.b};fill:none" stroke-width="3.6" stroke-linecap="round"/>
      <path d="${tassel}" style="fill:${colours.b}"/>
    </g>
  </g>
</svg>`;
}

/**
 * Nibbles with the full face in a graduation cap, for the loader (the companion working, not the mark).
 * @param uid - Unique id prefix for gradients
 */
export function cappedNibblesMarkup(uid = "cn", colours: NibblesColours = NIBBLES_VARS) {
  const p = colours;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 12 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="${uid}f" cx="45%" cy="40%" r="72%"><stop offset="0" style="stop-color:${p.hi}"/><stop offset="1" style="stop-color:${p.lo}"/></radialGradient>
    <linearGradient id="${uid}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${p.a}"/><stop offset="1" style="stop-color:${p.b}"/></linearGradient>
  </defs>
  <g>
    <circle cx="29" cy="52" r="11" style="fill:${p.ear}"/><circle cx="29" cy="53" r="6" style="fill:#f9a8d4" opacity=".55"/>
    <circle cx="91" cy="52" r="11" style="fill:${p.ear}"/><circle cx="91" cy="53" r="6" style="fill:#f9a8d4" opacity=".55"/>
    <ellipse cx="60" cy="79" rx="42" ry="33" style="fill:url(#${uid}f)"/>
    <ellipse cx="34" cy="89" rx="14" ry="11.5" style="fill:${p.hi}" opacity=".9"/><ellipse cx="86" cy="89" rx="14" ry="11.5" style="fill:${p.hi}" opacity=".9"/>
    <ellipse cx="33" cy="89" rx="6.5" ry="3.4" style="fill:#f9a8d4" opacity=".5"/><ellipse cx="87" cy="89" rx="6.5" ry="3.4" style="fill:#f9a8d4" opacity=".5"/>
    <ellipse cx="45" cy="76" rx="7.2" ry="8" style="fill:#1a1433"/><ellipse cx="75" cy="76" rx="7.2" ry="8" style="fill:#1a1433"/>
    <circle cx="47.3" cy="73.3" r="2.6" style="fill:#fff"/><circle cx="77.3" cy="73.3" r="2.6" style="fill:#fff"/>
    <path d="M57 84 h6 l-3 3z" style="fill:#e8799f"/>
    <path d="M55.2 88 q2.4 2.8 4.8 0 q2.4 2.8 4.8 0" style="stroke:#3b2a3b;fill:none" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M37 45.5 q23 -9 46 0 v8.5 q-23 -7.5 -46 0z" style="fill:#1d1930"/>
    <path d="M37 54 q23 -7.5 46 0" style="stroke:${p.a};fill:none" stroke-width="1.6" opacity=".55"/>
    <path d="M60 20 L106 34.5 L60 49 L14 34.5Z" style="fill:url(#${uid}c)"/>
    <path d="M60 20 L106 34.5 L60 49 L14 34.5Z" style="fill:none;stroke:#ffffff" stroke-width="1.2" stroke-linejoin="round" opacity=".35"/>
    <g class="tassel">
      <path d="M60 34.5 Q80 36.5 97 38.5 V57" style="stroke:#1d1930;fill:none" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M93.6 56 h6.8 l1.4 10 h-9.6z" style="fill:#1d1930"/>
    </g>
    <circle cx="60" cy="34.5" r="3.2" style="fill:#1d1930"/>
  </g>
</svg>`;
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
