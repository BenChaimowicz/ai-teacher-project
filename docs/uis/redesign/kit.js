/* Knibbler mock kit, shared by 02b, 03b, 04, 06 and 07.
   Plain globals on purpose: these are throwaway mocks opened from disk.
   The companion is Nibbles (was "Bao"; the bao* identifiers stay as aliases). */

/* ---------- icons (stroke, 24px grid) ---------- */
const ICONS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  network: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  easier: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  zap: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5.5 1 1.5 2 2 2 2 0-2.5 0-4.5 1-6.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  sparkle: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

/* ---------- course icons ----------
   Hand-drawn for the mock, same stroke style as ICONS. In the real app the plan step picks
   an icon name from a licensed library (see 08-course-icons.md). */
const COURSE_ICONS = {
  /* Mjölnir: a wide head with flared faces, short wrapped handle, ring pommel */
  norse: '<path d="M5 3.5h14l2 2v5l-2 2H5l-2-2v-5z"/><path d="M7.5 3.5v9M16.5 3.5v9"/><path d="M10.7 12.5v6.6h2.6v-6.6"/><path d="M10.7 15l2.6-1.1M10.7 17.4l2.6-1.1"/><circle cx="12" cy="20.9" r="1.4"/>',
  /* a necktie: collar, knot, blade (reads better at 20px than a drawn reef knot) */
  knot: '<path d="M7 3.5l5 2.8 5-2.8"/><path d="M10 6.3h4l-.9 2.6h-2.2z"/><path d="M10.9 8.9L9 17.4l3 3.4 3-3.4-1.9-8.5"/>',
  /* Ionic column: abacus, two volutes, fluted shaft, stepped base */
  greek: '<path d="M3.5 4h17"/><path d="M5 4.2c0 2.4 1.4 3.3 2.6 3.3a1.3 1.3 0 0 0 0-2.6M19 4.2c0 2.4-1.4 3.3-2.6 3.3a1.3 1.3 0 0 1 0-2.6"/><path d="M7.6 7.5h8.8"/><path d="M8.5 8.5v9.5M12 8.5v9.5M15.5 8.5v9.5"/><path d="M6.5 18.2h11M5 21h14"/>',
  /* two beamed eighth notes */
  music: '<path d="M9 17.5V5.5l11-2.2v12"/><path d="M9 9.2l11-2.2"/><ellipse cx="6.5" cy="17.6" rx="2.6" ry="2.1"/><ellipse cx="17.5" cy="15.4" rx="2.6" ry="2.1"/>',
  /* the world tree: round crown, trunk, spreading roots */
  yggdrasil: '<path d="M12 2.8c2.6 0 4.6 1.8 4.9 4.1a3.4 3.4 0 0 1-.6 6.6H7.7a3.4 3.4 0 0 1-.6-6.6C7.4 4.6 9.4 2.8 12 2.8z"/><path d="M12 13.5v5.3M12 11.2l-2.2-2M12 10.4l2-1.7"/><path d="M12 18.8c-1.2 0-2.6.8-4.6 2.4M12 18.8c1.2 0 2.6.8 4.6 2.4M12 18.8v2.6"/>',
  /* a bloomer loaf with three scores */
  sourdough: '<path d="M3.5 15.2C3.5 10 7.3 7 12 7s8.5 3 8.5 8.2v1.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z"/><path d="M7.6 12.6l1.8-2.1M11.1 12.2l1.8-2.3M14.6 12.6l1.8-2.1"/>',
  /* a coin with a rising line */
  investing: '<circle cx="12" cy="12" r="9"/><path d="M7.2 15.2l3-3 2.2 2 4.2-4.6"/><path d="M14 9.4h2.8v2.8"/>',
  generic: ICONS.sparkle,
};
function courseIcon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${COURSE_ICONS[key] || COURSE_ICONS.generic}</svg>`;
}

/* ---------- Nibbles (the companion) ----------
   .look wraps the eyes so the pupils can follow the pointer; .eyes inside keeps the blink. */
let baoId = 0;
function baoSVG() {
  const id = "bao" + baoId++;
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <defs><radialGradient id="${id}" cx="45%" cy="35%" r="70%"><stop offset="0" class="hi"/><stop offset="1" class="lo"/></radialGradient></defs>
    <g class="body-g">
      <g class="ear-l"><circle cx="30" cy="40" r="11" class="ear"/><circle cx="30" cy="41" r="6" fill="#f9a8d4" opacity=".55"/></g>
      <g class="ear-r"><circle cx="90" cy="40" r="11" class="ear"/><circle cx="90" cy="41" r="6" fill="#f9a8d4" opacity=".55"/></g>
      <ellipse cx="60" cy="72" rx="42" ry="37" fill="url(#${id})"/>
      <g class="cheeks">
        <ellipse cx="34" cy="82" rx="15" ry="13" class="cheek" opacity=".9"/><ellipse cx="86" cy="82" rx="15" ry="13" class="cheek" opacity=".9"/>
        <ellipse cx="33" cy="82" rx="6.5" ry="3.6" fill="#f9a8d4" opacity=".45"/><ellipse cx="87" cy="82" rx="6.5" ry="3.6" fill="#f9a8d4" opacity=".45"/>
      </g>
      <g class="look"><g class="eyes">
        <ellipse cx="45" cy="67" rx="7.5" ry="8.4" fill="#1a1433"/><ellipse cx="75" cy="67" rx="7.5" ry="8.4" fill="#1a1433"/>
        <circle cx="47.4" cy="64.2" r="2.7" fill="#fff"/><circle cx="77.4" cy="64.2" r="2.7" fill="#fff"/>
        <circle cx="42.4" cy="69.2" r="1.2" fill="#fff"/><circle cx="72.4" cy="69.2" r="1.2" fill="#fff"/>
      </g></g>
      <path d="M57 76 h6 l-3 3z" fill="#e8799f"/>
      <path d="M55 80 q2.5 3 5 0 q2.5 3 5 0" stroke="#3b2a3b" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="60" cy="97" rx="5" ry="7.5" class="seed"/>
      <circle cx="53" cy="98" r="4.5" class="paw"/><circle cx="67" cy="98" r="4.5" class="paw"/>
    </g>
  </svg>`;
}
const nibblesSVG = baoSVG;
function fillBaos(root = document) { root.querySelectorAll("[data-bao]").forEach((el) => { if (!el.innerHTML) el.innerHTML = baoSVG(); }); }

/* ---------- logo: Nibbles' silhouette in a graduation cap ----------
   A flat mark: head contour (ears, cheek bulge) in the a→b gradient, the cap as a second solid
   shape, separated from the head by a cut-out gap so it stays crisp at 16px. No face: the full
   face belongs to the companion (and the loader).
   p holds colours: CSS var() strings for the inline themed logo, or hex for the favicon / file.
   Fills go in style="" because SVG presentation attributes don't take var(). */
let logoId = 0;
const LOGO_VARS = { a: "var(--a)", b: "var(--b)", hi: "var(--bao-hi)", lo: "var(--bao-lo)", ear: "var(--bao-ear)" };
function logoMarkup(p = LOGO_VARS, uid = "lg" + logoId++) {
  const board = "M50 7 L95 21.5 L50 36 L5 21.5Z";
  const band = "M29 25 L71 25 L71 39.5 Q50 33.5 29 39.5Z";
  const cord = "M94 22.5 V40";
  const tassel = "M89.8 38.5 h8.4 l1.6 11 h-11.6z";
  /* one smooth contour: rounded brow, wide cheek bulges, round chin (a hamster, not a sack) */
  const head = "M50 33 C64 33 75 40 79 50 C89 55 94 67 89 79 C84 91 69 97 50 97 C31 97 16 91 11 79 C6 67 11 55 21 50 C25 40 36 33 50 33Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="${uid}h" gradientUnits="userSpaceOnUse" x1="18" y1="30" x2="80" y2="98"><stop offset="0" style="stop-color:${p.a}"/><stop offset="1" style="stop-color:${p.b}"/></linearGradient>
    <linearGradient id="${uid}c" gradientUnits="userSpaceOnUse" x1="5" y1="8" x2="95" y2="54"><stop offset="0" style="stop-color:${p.a}"/><stop offset="1" style="stop-color:${p.b}"/></linearGradient>
    <mask id="${uid}m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect width="100" height="100" fill="#fff"/>
      <g style="fill:#000;stroke:#000" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
        <path d="${board}"/><path d="${band}"/><path d="${tassel}"/><path d="${cord}" fill="none"/>
      </g>
    </mask>
  </defs>
  <g class="mark-head" mask="url(#${uid}m)" style="fill:url(#${uid}h)">
    <circle cx="22" cy="41" r="11"/><circle cx="78" cy="41" r="11"/>
    <path d="${head}"/>
  </g>
  <g class="mark-cap">
    <path d="${band}" style="fill:url(#${uid}c)"/>
    <path d="${band}" style="fill:#000" opacity=".28"/>
    <path d="${board}" style="fill:url(#${uid}c)"/>
    <g class="tassel">
      <path d="${cord}" style="stroke:${p.b};fill:none" stroke-width="3.6" stroke-linecap="round"/>
      <path d="${tassel}" style="fill:${p.b}"/>
    </g>
  </g>
</svg>`;
}
/* The capped companion with the full face, used by the loader (it's Nibbles working, not the mark). */
function cappedNibblesMarkup(p = LOGO_VARS, uid = "cn" + logoId++) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 12 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="${uid}f" cx="45%" cy="40%" r="72%"><stop offset="0" style="stop-color:${p.hi}"/><stop offset="1" style="stop-color:${p.lo}"/></radialGradient>
    <linearGradient id="${uid}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${p.a}"/><stop offset="1" style="stop-color:${p.b}"/></linearGradient>
  </defs>
  <g class="nib">
    <g class="ear-l"><circle cx="29" cy="52" r="11" style="fill:${p.ear}"/><circle cx="29" cy="53" r="6" style="fill:#f9a8d4" opacity=".55"/></g>
    <g class="ear-r"><circle cx="91" cy="52" r="11" style="fill:${p.ear}"/><circle cx="91" cy="53" r="6" style="fill:#f9a8d4" opacity=".55"/></g>
    <ellipse cx="60" cy="79" rx="42" ry="33" style="fill:url(#${uid}f)"/>
    <ellipse cx="34" cy="89" rx="14" ry="11.5" style="fill:${p.hi}" opacity=".9"/><ellipse cx="86" cy="89" rx="14" ry="11.5" style="fill:${p.hi}" opacity=".9"/>
    <ellipse cx="33" cy="89" rx="6.5" ry="3.4" style="fill:#f9a8d4" opacity=".5"/><ellipse cx="87" cy="89" rx="6.5" ry="3.4" style="fill:#f9a8d4" opacity=".5"/>
    <g class="look"><g class="eyes">
      <ellipse cx="45" cy="76" rx="7.2" ry="8" style="fill:#1a1433"/><ellipse cx="75" cy="76" rx="7.2" ry="8" style="fill:#1a1433"/>
      <circle cx="47.3" cy="73.3" r="2.6" style="fill:#fff"/><circle cx="77.3" cy="73.3" r="2.6" style="fill:#fff"/>
    </g></g>
    <path d="M57 84 h6 l-3 3z" style="fill:#e8799f"/>
    <path d="M55.2 88 q2.4 2.8 4.8 0 q2.4 2.8 4.8 0" style="stroke:#3b2a3b;fill:none" stroke-width="1.8" stroke-linecap="round"/>
    <!-- cap: skull band, board, button, swinging tassel -->
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
/* Inline, themed logo (follows the palette). size in px. */
function logoSVG({ size = 28, track = false } = {}) {
  return `<span class="logo bao ${track ? "track" : ""}" style="--s:${size}px" role="img" aria-label="Knibbler">${logoMarkup()}</span>`;
}
function themeColours() {
  const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
  return { a: v("--a"), b: v("--b"), hi: v("--bao-hi"), lo: v("--bao-lo"), ear: v("--bao-ear") };
}
function logoDataURI(p = themeColours()) { return "data:image/svg+xml," + encodeURIComponent(logoMarkup(p, "fav")); }
/* Tab icon follows the current palette. Static fallback: nibbles-logo.svg. */
function setFavicon() {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
  link.type = "image/svg+xml";
  link.href = logoDataURI();
}

/* Loader: capped Nibbles hopping, tassel swinging, three dots being "nibbled".
   size >= 48 gets a shadow, dots and an optional label; small sizes are inline. */
function loaderHTML({ size = 96, label = "" } = {}) {
  const sm = size < 48;
  return `<span class="loader ${sm ? "sm" : ""}" style="--s:${size}px" role="status" aria-label="${label || "Loading"}">
    <span class="ld-stage"><span class="ld-nib">${cappedNibblesMarkup()}</span>${sm ? "" : `<span class="ld-shadow"></span>`}</span>
    ${sm ? "" : `<span class="ld-dots"><i></i><i></i><i></i></span>`}
    ${label && !sm ? `<span class="ld-label">${label}</span>` : ""}
  </span>`;
}

/* ---------- themes ---------- */
const THEMES = [
  ["amethyst", "Purple · light blue", "#a78bfa", "#7dd3fc"],
  ["rose", "Red · pink", "#fb7185", "#f9a8d4"],
  ["honey", "Yellow · brown", "#f5c451", "#c8935f"],
  ["matcha", "Light green · orange", "#9ae6b4", "#fdba74"],
  ["slate", "Grey · flashes of blue", "#cbd5e1", "#60a5fa"],
];
function setTheme(key) {
  document.documentElement.dataset.theme = key;
  localStorage.setItem("knibbler-theme", key);
  document.querySelectorAll(".sw button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === key)));
  setFavicon();
}
/* Renders the palette swatches into `el`. */
function initThemes(el) {
  el.innerHTML = THEMES.map(([k, label, a, b]) =>
    `<button type="button" data-k="${k}" title="${label}"><span style="background:linear-gradient(135deg, ${a} 50%, ${b} 50%)"></span></button>`).join("");
  el.querySelectorAll("button").forEach((b) => (b.onclick = () => setTheme(b.dataset.k)));
  setTheme(localStorage.getItem("knibbler-theme") || "amethyst");
}

/* ---------- player: streak and today's goal (no points or currency) ---------- */
const PLAYER = { streak: 3, minutes: 18, goal: 20, week: [2, 3, 0, 1, 3, 2, 1], seeds: 0 /* deprecated, unused */ };

/* Companion card: compact (the sidebar never scrolls).
   Nibbles (clickable, eyes follow the pointer) inside a today's-goal ring, name, streak + today, and a speech bubble. */
function buddyHTML() {
  return `<div class="buddy" id="buddy">
    <span class="spk" style="top:10px;left:10px">✦</span><span class="spk" style="top:6px;left:62px;animation-delay:.2s">✦</span><span class="spk" style="top:54px;left:4px;animation-delay:.4s">✦</span>
    <div class="buddy-top">
      <button type="button" class="buddy-av" id="buddy-av" aria-label="Nibbles. Click for another line.">
        <svg class="ring" viewBox="0 0 84 84"><defs><linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--b)"/></linearGradient></defs>
          <circle class="track" cx="42" cy="42" r="40"/><circle class="val" id="ring-val" cx="42" cy="42" r="40" stroke-dasharray="251.3" stroke-dashoffset="251.3"/></svg>
        <span class="bao track" id="buddy-bao">${baoSVG()}</span>
      </button>
      <div class="buddy-id">
        <div class="nm"><b>Nibbles</b></div>
        <div class="brow">
          <span title="day streak"><span class="ico">${icon("flame")}</span><b id="st-streak">${PLAYER.streak}</b><small>days</small></span>
          <span title="today's goal"><span class="ico">${icon("clock")}</span><b id="st-min">${PLAYER.minutes}</b><small>/${PLAYER.goal} min</small></span>
        </div>
      </div>
    </div>
    <div class="say-wrap"><div class="buddy-say" id="buddy-say" aria-live="polite"><span class="say-text" id="say-text"></span></div></div>
    <b id="st-seeds" hidden></b>
  </div>`;
}
function renderBuddy() {
  const pct = Math.min(1, PLAYER.minutes / PLAYER.goal);
  const ring = document.getElementById("ring-val");
  if (ring) ring.style.strokeDashoffset = String(251.3 * (1 - pct));
  const st = document.getElementById("st-streak"); if (st) st.textContent = PLAYER.streak;
  const sm = document.getElementById("st-min"); if (sm) sm.textContent = PLAYER.minutes;
  const av = document.getElementById("buddy-av"); if (av) av.title = `Today: ${PLAYER.minutes} of ${PLAYER.goal} minutes`;
}
/* Adds minutes to today (ring + counter animate). */
function addMinutes(n) {
  const before = PLAYER.minutes;
  PLAYER.minutes += n; renderBuddy();
  const el = document.getElementById("st-min");
  if (el) { countTo(el, before, PLAYER.minutes); bump("st-min"); }
}

/* Speech bubble. Shows tiny typing dots first unless { typing: false }. */
let sayTicket = 0;
function baoSay(text, mood, { typing = true } = {}) {
  const box = document.getElementById("buddy-say");
  if (!box) return;
  const t = document.getElementById("say-text");
  const my = ++sayTicket;
  const put = () => {
    if (my !== sayTicket) return;
    box.classList.remove("is-typing");
    t.innerHTML = text; t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop");
  };
  if (mood) baoMood(mood);
  if (typing && t.innerHTML && !REDUCED) { box.classList.add("is-typing"); setTimeout(put, 420); } else put();
}
const nibblesSay = baoSay;

/* Lines Nibbles cycles through when clicked. Pages set context lines; defaults are low-key. */
const DEFAULT_LINES = [
  "I'm here if you need me.",
  "Small steps add up.",
  "A short break helps things stick.",
  "Curious about something? We can make a course of it.",
  "No rush. Go at your pace.",
];
let LINES = DEFAULT_LINES, lineIdx = -1;
function nibblesLines(lines) { LINES = lines && lines.length ? lines : DEFAULT_LINES; lineIdx = -1; }
function nibblesNext() {
  const cur = document.getElementById("say-text")?.textContent;
  for (let i = 0; i < LINES.length; i++) {
    lineIdx = (lineIdx + 1) % LINES.length;
    if (LINES[lineIdx] !== cur || LINES.length === 1) break;
  }
  baoSay(LINES[lineIdx]);
}

/* mood: "idle" | "think" | "cheer", shown on Nibbles (still, bobbing, hopping) */
function baoMood(mood) {
  const b = document.getElementById("buddy");
  if (!b) return;
  b.classList.remove("is-think", "is-cheer"); void b.offsetWidth;
  if (mood !== "idle") b.classList.add("is-" + mood);
  if (mood === "cheer") setTimeout(() => b.classList.contains("is-cheer") && baoMood("idle"), 2200);
}
const nibblesMood = baoMood;
function bump(id) { const el = document.getElementById(id); if (!el) return; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

function countTo(el, from, to, ms = 600) {
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------- interaction: eyes follow the pointer, idle glances, hover twitch, click squish ---------- */
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const POINTER = { x: 0, y: 0, last: -1e9 };
const IDLE = { x: 0, y: 0, next: 0 };
addEventListener("pointermove", (e) => { POINTER.x = e.clientX; POINTER.y = e.clientY; POINTER.last = performance.now(); }, { passive: true });
function lookTick(now) {
  const idle = now - POINTER.last > 3500;
  if (idle && now > IDLE.next) { /* glance somewhere, or back to centre */
    const r = Math.random();
    IDLE.x = r < 0.35 ? 0 : (Math.random() - 0.5) * 2; IDLE.y = r < 0.35 ? 0 : (Math.random() - 0.5) * 1.4;
    IDLE.next = now + 1800 + Math.random() * 2600;
  }
  document.querySelectorAll(".bao.track .look").forEach((g) => {
    let tx, ty;
    if (idle) { tx = IDLE.x * 3; ty = IDLE.y * 2.4; }
    else {
      const r = g.ownerSVGElement.getBoundingClientRect();
      const dx = POINTER.x - (r.left + r.width / 2), dy = POINTER.y - (r.top + r.height * 0.55);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220);
      tx = (dx / d) * 3.4 * k; ty = (dy / d) * 2.6 * k;
    }
    g._x = (g._x || 0) + (tx - (g._x || 0)) * 0.14;
    g._y = (g._y || 0) + (ty - (g._y || 0)) * 0.14;
    g.setAttribute("transform", `translate(${g._x.toFixed(2)} ${g._y.toFixed(2)})`);
  });
  requestAnimationFrame(lookTick);
}
if (!REDUCED) requestAnimationFrame(lookTick);
document.addEventListener("click", (e) => {
  const av = e.target.closest?.(".buddy-av");
  if (!av) return;
  av.classList.remove("squish"); void av.offsetWidth; av.classList.add("squish");
  nibblesNext();
});

/* ---------- feedback: a small burst, optionally a short chip. No numbers, no currency. ---------- */
function cheer(el, text) {
  if (!el) return;
  confettiAt(el, { count: 18, power: 0.6 });
  if (!text) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "float-chip"; f.innerHTML = `${icon("check")}<span>${text}</span>`;
  f.style.left = r.left + r.width / 2 + "px"; f.style.top = r.top + "px";
  document.body.appendChild(f);
  f.animate([
    { transform: "translate(-50%, 4px) scale(0.85)", opacity: 0 },
    { transform: "translate(-50%, -22px) scale(1)", opacity: 1, offset: 0.25 },
    { transform: "translate(-50%, -30px) scale(1)", opacity: 1, offset: 0.75 },
    { transform: "translate(-50%, -40px) scale(0.96)", opacity: 0 },
  ], { duration: REDUCED ? 1 : 1500, easing: "ease-out" }).onfinish = () => f.remove();
}
/* Deprecated shims: seeds are gone. Pages should call cheer(el, text) instead. */
function award(_n, el) { cheer(el); }
function addSeeds() {}
const SEED = icon("sparkle");

/* ---------- confetti (small, accent-coloured, short) ---------- */
let confettiCanvas, confettiParts = [], confettiRunning = false;
function confetti(x, y, { count = 40, spread = 1, power = 1 } = {}) {
  if (REDUCED) return;
  if (!confettiCanvas) {
    confettiCanvas = document.createElement("canvas"); confettiCanvas.id = "confetti";
    document.body.appendChild(confettiCanvas);
  }
  const cs = getComputedStyle(document.documentElement);
  const colours = [cs.getPropertyValue("--a").trim(), cs.getPropertyValue("--b").trim(), "#ffffff"];
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const v = (4 + Math.random() * 5) * power;
    confettiParts.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colours[i % 3], life: 1, sq: Math.random() > 0.5 });
  }
  if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(confettiTick); }
}
function confettiTick() {
  const c = confettiCanvas, ctx = c.getContext("2d");
  if (c.width !== innerWidth) { c.width = innerWidth; c.height = innerHeight; }
  ctx.clearRect(0, 0, c.width, c.height);
  confettiParts = confettiParts.filter((p) => p.life > 0);
  for (const p of confettiParts) {
    p.vy += 0.18; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
    ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    if (p.sq) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.7, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  if (confettiParts.length) requestAnimationFrame(confettiTick); else { confettiRunning = false; ctx.clearRect(0, 0, c.width, c.height); }
}
function confettiAt(el, opts) { const r = el.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, opts); }

/* ---------- toasts ---------- */
function toast(title, sub = "", ic = "check") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span class="tic">${icon(ic === "seed" ? "check" : ic)}</span><div><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
  box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 3200);
}

/* ---------- brand row: put the logo next to any .wordmark, set the tab icon ---------- */
document.querySelectorAll(".brand-row .wordmark").forEach((w) => {
  if (w.previousElementSibling?.classList.contains("logo") || w.parentElement.classList.contains("brand")) return;
  const brand = document.createElement("span"); brand.className = "brand";
  w.replaceWith(brand); brand.innerHTML = logoSVG({ size: 28 }); brand.appendChild(w);
});
setFavicon();

/* ---------- thread (chat-like, options inline under Nibbles' line) ---------- */
const T = { el: null, scroll: null, lastWasBao: false, token: 0, autoScroll: true };
function useThread(el, scrollEl) { T.el = el; T.scroll = scrollEl; T.lastWasBao = false; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* Keep the newest thing in view, without yanking the page to the very bottom. */
function reveal(node) {
  if (!T.autoScroll || !node) return;
  requestAnimationFrame(() => {
    const s = T.scroll, top = node.getBoundingClientRect().bottom - s.getBoundingClientRect().bottom;
    if (top > -24) s.scrollBy({ top: top + 48, behavior: "smooth" });
  });
}
/* Nibbles' line. Resolves false if the flow was cancelled meanwhile (T.token changed). */
async function bao(html, pause = 520) {
  const my = T.token;
  const row = document.createElement("div");
  row.className = "trow" + (T.lastWasBao ? "" : " gap");
  row.innerHTML = `<div class="av bao ${T.lastWasBao ? "empty" : ""}">${T.lastWasBao ? "" : baoSVG()}</div><div class="msg"><span class="typing"><i></i><i></i><i></i></span></div>`;
  T.el.appendChild(row); reveal(row); T.lastWasBao = true;
  await wait(pause);
  if (my !== T.token) return false;
  row.querySelector(".msg").innerHTML = html; reveal(row);
  return true;
}
function me(html, cls = "") {
  const row = document.createElement("div");
  row.className = `trow me gap ${cls}`;
  row.innerHTML = `<div class="msg">${html}</div>`;
  T.el.appendChild(row); reveal(row); T.lastWasBao = false;
  return row;
}
function block(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  const node = wrap.firstElementChild;
  T.el.appendChild(node); reveal(node); T.lastWasBao = false;
  return node;
}
/* Option tiles right under Nibbles' line.
   items: { label, desc?, icon?, primary?, quiet?, unsure?, ...anything }
   opts:  { cols: 1|2|3, echo: true, judge?: (item) => "good" | "miss" | null, correct?: index }
   Resolves { item, row } where row is the echoed "me" bubble (or the picked tile if echo is false). */
function choose(items, { cols = 2, echo = true, judge, correct } = {}) {
  const my = T.token;
  return new Promise((resolve) => {
    const box = block(`<div class="tiles ${cols === 1 ? "one" : cols === 3 ? "three" : ""}">${items.map((o, i) => `
      <button type="button" class="tile ${o.primary ? "primary" : ""} ${o.quiet ? "quiet" : ""} ${o.unsure ? "unsure" : ""}" data-i="${i}" style="--i:${i}">
        ${o.icon || o.unsure ? `<span class="ti">${icon(o.icon || "help")}</span>` : ""}
        <span><span class="tt">${o.label}</span>${o.desc ? `<span class="td">${o.desc}</span>` : ""}</span>
        <kbd>${i + 1}</kbd>
      </button>`).join("")}</div>`);
    box.querySelectorAll(".tile").forEach((b) => (b.onclick = async () => {
      if (box.classList.contains("locked")) return;
      const item = items[+b.dataset.i];
      const verdict = judge ? judge(item) : null;
      box.classList.add("locked");
      b.classList.add(verdict || "picked");
      if (verdict === "good") confettiAt(b, { count: 22, power: 0.7 });
      if (verdict === "miss" && correct != null) box.querySelectorAll(".tile")[correct]?.classList.add("reveal");
      await wait(verdict ? 750 : 260);
      if (my !== T.token) return;
      if (!echo) { resolve({ item, row: b }); return; }
      box.classList.add("gone");
      await wait(300);
      box.remove();
      const mark = verdict === "good" ? `<span class="mark">✓</span>` : verdict === "miss" && !item.unsure ? `<span class="mark">✕</span>` : "";
      const row = me(item.echo || item.label + mark, verdict || "");
      resolve({ item, row });
    }));
  });
}
document.addEventListener("keydown", (e) => {
  if (document.activeElement?.tagName === "INPUT") return;
  const n = Number(e.key);
  if (!(n >= 1 && n <= 9)) return;
  const boxes = document.querySelectorAll(".tiles:not(.locked)");
  boxes[boxes.length - 1]?.querySelectorAll(".tile")[n - 1]?.click();
});

/* ---------- course rows (sidebar) ---------- */
/* One line per course: status dot, title, tiny progress, short mono badge. Details live on Home.
   c: { id, title, status: "learning"|"making"|"needs"|"done", segs?: "ddn--" (d done, n now, w writing, - todo), badge?,
        icon?: courseIcon key. With an icon, the row shows a small course icon with the status as a dot on its corner. } */
function courseCard(c, active) {
  const segs = c.segs || "";
  const done = [...segs].filter((x) => x === "d").length;
  const badge = c.badge ?? { learning: segs ? `${done}/${segs.length}` : "", making: "writing", needs: "needs you", done: "✓ done" }[c.status];
  const lead = c.icon
    ? `<span class="cico ${c.status}">${courseIcon(c.icon)}<i class="cdot ${c.status}"></i></span>`
    : `<span class="cdot ${c.status}"></span>`;
  return `<button type="button" class="ccard ${active ? "active" : ""}" data-id="${c.id}">
    ${lead}<span class="t">${c.title}</span>
    ${segs && c.status !== "done" ? `<span class="cbar ${segs.includes("w") ? "w" : ""}"><i style="width:${(done / segs.length) * 100}%"></i></span>` : ""}
    <span class="st ${c.status}">${badge}</span>
  </button>`;
}
const nibbles = bao; /* thread line, new name */
