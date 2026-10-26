# Papercraft implementation plan (SEN-97)

2026-10-26. How to take the app from the SEN-86 kit (5 glowing palettes, Nibbles) to the Papercraft direction in [`10-papercraft-jongi.html`](10-papercraft-jongi.html), with the companion **Jongi**. The flows and behaviour built in SEN-86/87/88 stay as they are; this is a re-skin plus a new companion.

Work happens on `yardenfarag/sen-97-papercraft-implementation`, branched from the SEN-97 branch.

## Decisions

Settled with Yarden on 2026-10-26:

| Topic | Decision |
| --- | --- |
| Palette | **One Papercraft palette.** The 5 switchable palettes, the palette picker and the palette-following favicon go. |
| Lesson text | **Manrope stays the default.** The mock's Literata stays a reading option in the Aa panel. |
| Jongi | **Port the mock's SVG to React now.** Use the same states and inputs a Rive file would have, so a professional Rive version can replace it later. |
| Italics | **None anywhere.** No italic font files are loaded, and a global rule blocks synthesized italics. |
| Name | **Jongi.** This also closes SEN-96. |

Where we deliberately differ from the mock:

- **No seeds.** The mock's notes mention "seeds count up", but the no seeds/XP/levels rule still holds.
- **Lessons in Manrope, not Literata.**
- **The study chrome.** Reading modes, the Aa panel and the page colours (Dark, Dim, Sepia, Paper) stay as SEN-88 built them. Dark becomes the ink paper tone.

## Approach

**Keep the token names and change their values.** About 1,500 CSS lines across `kit.css`, `shell.css`, `learn.css` and `make-course.css` use `--a`, `--a-rgb`, `--b`, `--panel`, `--line` and `--glow`. Re-pointing those to paper values moves most of the app in one step. Then restyle the components that need a different shape (ribbons, stacked sheets, pop-up buttons), and clean up the hard-coded `rgba`s and gradients that assumed glow.

Token mapping, from the mock's `:root`:

| Token | Today | Papercraft |
| --- | --- | --- |
| `--bg` | accent-tinted near-black | desk `#0b0e18` |
| `--bg-2` | | sidebar `#0e1222` |
| `--panel` / `--panel-2` | accent-tinted panel | ink navy `#141a2e` / `#18203b` |
| `--a` | palette accent | apricot `#d8955c` (selection rim, focus, primary) |
| `--b` | palette second accent | cream `#f0e0c2` |
| new: `--ribbon` | | bookmark `#c8473b` (needs you, streak) |
| new: `--gold` | | gold thread `#e7b250` (wins only) |
| new: `--plum` | | plum `#2a1f3c` (secondary sheets) |
| `--line` / `--line-2` | accent alpha | `rgba(255,255,255,.065)` / a bit stronger |
| `--glow` | accent glow | **removed.** Replaced by `--sheet` and `--stack` shadows (depth, not light) |
| `--text`, `--text-muted`, `--faint` | | `#ebe6dc`, `#8e90a6`, and a faint tone that passes AA |
| `--good` / `--miss` | | kept, retuned to sit on paper |
| `--font-ui` | Manrope | Space Grotesk |
| new: `--font-display` | | Instrument Serif, regular weight only |
| `--font-read` | Manrope | Manrope (unchanged) |
| `--font-code` | JetBrains Mono | JetBrains Mono (unchanged) |

## Phases

Phase 0 has to land first, because it's the shared contract. After it, phases 1 and 2 touch separate files and can run in parallel. Phase 3 can then be split between two agents along the SEN-87/88 line.

### Phase 0: Tokens and fonts (the contract)

- **`index.css`:** replace the 5 `[data-theme]` blocks with one Papercraft `:root` as mapped above. Add `--sheet`, `--stack`, `--ribbon`, `--gold`, `--plum` and `--font-display`. Remove `--nib-*`.
- **Fonts:** add `@fontsource/instrument-serif` and `@fontsource/space-grotesk`, normal styles only. Keep Manrope, JetBrains Mono, Literata and Atkinson for the Aa panel.
- **No italics:** add a global `font-style: normal` with `font-synthesis: none`, and remove `<em>`/italic styling where it carries meaning (use weight or colour instead).
- **Palettes:** delete the palette parts of `lib/theme.ts`, `components/shell/palette-picker.tsx` and its uses (the shell and `/dev/components`), and the favicon recolouring.
- **Check:** AA contrast for text, muted and faint on desk, paper and plum.

### Phase 1: Kit components (`styles/kit.css`, `styles/shell.css`, `components/ui/*`)

- **Buttons:** pop-up tabs on a darker under-sheet that fold down 2px when pressed. The primary button is apricot.
- **Option tiles:** a resting sheet, a stacked state ("needs you"), and a selected state that lifts with an apricot rim. The good/miss states are kept, with no glow.
- **Status:** status badges on `CourseRow` and `CourseCard` become notched bookmark ribbons. Red is reserved for "needs you" and the streak.
- **Progress:**
  - `ProgressBar` becomes a ribbon bar with a notched end.
  - `ProgressRing` is cut into paper segments.
  - `SegmentedProgress` matches.
- **Cards, dialog, toast and states:** paper sheets with the `--sheet` and `--stack` shadows.
- **Effects:** confetti becomes paper pieces with two-sided flips. The cheer chip is restyled.
- **Loader:** the mock's page-flip loader.
- **Chat thread and sidebar:** the companion line, the Learner echo and the sidebar in paper style. The sidebar still never scrolls.
- **Check:** the sidebar no-scroll e2e test and keyboard focus rings (an apricot rim).

### Phase 2: Jongi, the logo and the rename (`components/companion/*`, `lib/brand-marks.ts`)

- **`Jongi` component:** port the hamster's paper layers from the mock into `components/companion/jongi.tsx`.
  - **Props:** `mood: "idle" | "think" | "cheer" | "rest"`, `size`, and pointer look-at.
  - **Idle:** breathing, random blinks and an ear flick.
  - **Win:** a one-shot that returns to idle.
  - **Motion:** parallax capped low, and reduced motion respected.
  - **Rive contract:** document it in the file. It needs states Idle/Thinking/Win/Resting and inputs `lookX`/`lookY`, so a Rive version can drop in behind the same props.
- **Replace `Nibbles` everywhere:**
  - `CompanionCard`, `ChatThread` (rename `NibblesLine` to `CompanionLine`), the loader, and the empty and error states
  - the screens in `learn/` and `make-course/` that import it
- **Rename:**
  - `COMPANION_NAME` becomes "Jongi".
  - Update the user-facing copy, aria labels and `DEFAULT_COMPANION_LINES`.
  - Update any e2e assertions that use the name.
- **Logo and favicon:** take the mark from the mock (64 / 32 / 16) into `public/` and `logoMarkup`. The favicon is static now.

### Phase 3: Screens follow the kit (`components/learn/*`, `components/make-course/*`, `pages/*`)

- **Clean up the hard-coded colours.** `learn.css` has about 14 hex values, 74 `rgba`s and 21 gradients; `make-course.css` has about 32 `rgba`s and 7 gradients. Move them to tokens and remove glow and gradient effects that fight paper.
- **Screens to compare against the mock:**
  - **Agent A (SEN-87 screens):** New course, Course Request steps, How you like to learn.
  - **Agent B (SEN-88 screens):** Home (Continue card with the ribbon, grouped rows), Reading (header, Worth knowing, citation, "I've read it"), Quiz, Course complete.
- **Rule for both agents:** keep behaviour and copy unless the mock says otherwise; this phase is visual only.

### Phase 4: Reference, docs and checks

- **Reference page:** update `/dev/components` so it shows every component in its paper state, plus Jongi in all four moods. Remove the palette picker section.
- **Docs:**
  - Update `components/README.md` with new tokens, `Jongi`, `CompanionLine`, and the removed palette API.
  - Update `09-implementation-notes.md` (the palette, logo and font bullets).
  - Update the redesign README's token section.
- **Checks:** `pnpm typecheck`, `pnpm test` and `pnpm test:e2e`.
- **Visual pass:** screenshots of every screen next to the mock.
- **Accessibility:** AA contrast, and reduced motion.

## Out of scope

- A professional Rive version of Jongi (a follow-up once the look is signed off).
- New flows or behaviour.
- Backend changes.
- Extra paper colourways.
- Fine-tuning decisions that come up while reviewing. They go on SEN-97's running list and are applied as small follow-up commits.

## Risks

- **Contrast:** apricot on ink and the muted text on plum need checking. Adjust the token values rather than per-component overrides.
- **Size of the rename:** about 20 files reference Nibbles. Do it in one commit in phase 2 so it's easy to review.
- **Depth vs. performance:** stacked shadows on long lists. Keep shadows on sheets, not on every row.
- **Parallax and motion** must stay subtle in the product. The mock's hero stage is a showcase, not the sidebar.
