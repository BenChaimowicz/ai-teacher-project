# Components: the redesign contract (SEN-86)

This is the shared contract for screens built on the redesign (SEN-87 make-a-Course, SEN-88 learning). Screens compose these pieces; they do not restyle them. If a screen needs something new, add it here (component, README row, `/dev/components` section) rather than inlining a one-off.

- **See them live:** `/dev/components` (`src/pages/dev-components.tsx`) shows every component in its states, plus Jongi in every mood.
- **Visual reference:** the mocks in `docs/uis/redesign/` (`02b-new-course.html`, `03b-study.html`, `04-home.html`, `06-how-you-learn.html`, `07-brand.html`).
- **Decisions:** `docs/uis/redesign/09-implementation-notes.md`. In short: always dark, one Papercraft palette (SEN-97, `docs/uis/redesign/10-papercraft-jongi.html`), chat-*like* flows where the topic is the only free text, the companion Jongi is low-key and brief, no XP/seeds/levels.

Imports use the `@/` alias and the `.tsx` / `.ts` extension, e.g. `import { Button } from "@/components/ui/button.tsx"`.

## Tokens

Defined in `src/index.css` (`:root`) and `src/styles/kit.css` (component classes). Use the CSS variables, not hex values.

| Token | Use |
| --- | --- |
| `--bg`, `--bg-2` | Desk and sidebar. |
| `--panel`, `--panel-2`, `--plum`, `--plum-2` | Paper sheets: ink navy, raised, and plum for secondary sheets (e.g. "How you like to learn"). |
| `--well`, `--recess` (alias `--inset`) | Cut-out wells (icon slots, inputs, progress tracks) and the shadow inside them. |
| `--sheet`, `--stack`, `--stack-under`, `--edge`, `--hairline` | Depth. `--sheet` for a single sheet, `--stack` for a sheet with paper under it ("needs you", open tile groups). No glow: `--glow` is a deprecated no-op. |
| `--a`, `--a-deep` (`--a-rgb`), `--on-a` | Apricot: selected, primary, focus. `--a-deep` is the under-sheet of apricot buttons. Text on apricot uses `--on-a`. |
| `--b`, `--b-deep` (`--b-rgb`) | Cream highlights and key tabs. |
| `--ribbon` (`--ribbon-rgb`), `--ribbon-text` | Bookmark red, only for "needs you" and the streak. `--ribbon` for fills, `--ribbon-text` for text and icons (AA). |
| `--gold` (`--gold-rgb`) | Wins and what is being made. |
| `--line`, `--line-2`, `--a-soft`, `--a-line`, `--b-soft` | Hairlines and soft fills. |
| `--text`, `--read`, `--text-muted`, `--faint` | Text: UI, lesson body, secondary, tertiary. All pass AA on desk, paper and plum. |
| `--good`, `--miss` (`--on-good`, `--on-miss`) | Right / not quite, as rims rather than glows. |
| `--font-ui` (Space Grotesk), `--font-display` (Baloo 2, headings, weight `--weight-display`), `--font-read` (Manrope, lesson default), `--font-code` (JetBrains Mono, code and keys only), `--font-label` (labels and meta lines, = `--font-ui`), `--font-book` (Literata), `--font-legible` (Atkinson Hyperlegible) | No italics anywhere: a base rule sets `font-style: normal` and turns off synthesis. |
| `--dur-fast`, `--dur`, `--dur-slow`, `--ease-pop` | Motion. Respect `prefersReducedMotion()`. |

Status labels use the notched ribbon class `.k-rib` (tones: learning, making, needs, done, stopped, streak).

The shadcn names (`bg-background`, `text-muted-foreground`, `border-border`, …) are mapped onto these, so Tailwind utilities follow the tokens too. Small shared classes: `.k-mono`, `.k-sec-h` (mono section heading with a rule; `.n` child for a count).

## Shell — `components/shell/`

| Export | File | Props / API | Notes |
| --- | --- | --- | --- |
| `AppShell` | `app-shell.tsx` | `{ variant: "workspace" \| "study" }` | Route layout (renders `<Outlet />`). Sidebar never scrolls; drawer below 900px; Esc/backdrop close it; skip link to `#main`. |
| `useShell()` | `app-shell.tsx` | `{ variant, sidebarOpen, setSidebarOpen(open), setReadingProgress(0..1 \| null), slots }` | Throws outside `AppShell`. Reading progress resets on navigation. |
| `ShellTitle` | `app-shell.tsx` | `{ children }` | Top bar title. Without it, a default title from the path shows. |
| `ShellActions` | `app-shell.tsx` | `{ children }` | Top bar, right side (Aa panel button, course menu). |
| `ShellOutline` | `app-shell.tsx` | `{ children }` | Study variant only: sidebar content below the companion card (the Course outline). |
| `SidebarCourses` | `sidebar-courses.tsx` | none | Workspace sidebar course list (max 5, then "see all on Home"). Used by `AppShell`. |

## Companion — `components/companion/`

| Export | File | Props / API | Notes |
| --- | --- | --- | --- |
| `CompanionProvider` | `companion-provider.tsx` | `{ children }` | Wraps the app (in `App.tsx`). Counts a study minute per 60s on visible `/study/` pages. |
| `useCompanion()` | `companion-provider.tsx` | `{ line, lineId, mood, activity, say(text, mood?), next(), setMood(mood), setLines(lines \| null) }` | `"cheer"` mood falls back to idle after ~2s. |
| `useCompanionLines(lines)` | `companion-provider.tsx` | `string[]` | Sets the sidebar lines while a screen is mounted. **Pass a stable array** (module constant or `useMemo`). |
| `DEFAULT_COMPANION_LINES` | `companion-provider.tsx` | `string[]` | |
| `CompanionCard` | `companion-card.tsx` | none | Sidebar card: Jongi (56px, round tile) in the today-minutes ring, speech bubble, look-at, hover ear flick, click squash + another line, streak. A `"cheer"` mood plays Jongi's Win. Used by `AppShell`. |
| `Jongi` | `jongi.tsx` | `{ size? = 36, mood?: JongiMood = "idle", framing?: "bust" \| "full" \| "scene" = "bust", track?, parallax? = 0.25, tile?: boolean \| "round", label?, className?, style?, onWinEnd?, ref?: Ref<JongiHandle> }` | The companion, a cut-paper hamster. `JongiMood = "idle" \| "think" \| "cheer" \| "rest"`. Idle breathes, blinks at random and flicks an ear; `"cheer"` plays the one-shot Win each time it is set, then shows idle. `track` = eyes follow the pointer and the layers shift (parallax capped at 0.5). `bust` for avatars, `full` on its book, `scene` with the paper discs. Decorative unless `label` is set. Styles in `jongi.css`. |
| `JongiHandle` (type) | `jongi.tsx` | `{ win(), poke(), flick() }` | Imperative: the Win one-shot, a click squash, a hover ear flick. |

**Jongi and Rive.** `jongi.tsx`'s header is the Rive contract: states Idle / Thinking / Win (trigger) / Resting, inputs `lookX` / `lookY` (-1..1). A Rive file can replace the SVG behind the same props. Reduced motion holds each mood's still pose; Win shows happy eyes only.

Lines are one or two short sentences: kind, low-key, never childish or chatty. Use `COMPANION_NAME` ("Jongi"), never a hard-coded name.

## UI — `components/ui/`

| Export | File | Props | Notes |
| --- | --- | --- | --- |
| `Button`, `buttonVariants` | `button.tsx` | `button` props + `variant?: "primary" \| "secondary" \| "ghost" \| "quiet" \| "danger" \| "link"`, `size?: "default" \| "sm" \| "lg" \| "icon"`, `asChild?` | `asChild` wraps a `Link`. Aliases `default`/`outline`/`destructive` exist for older screens; don't use them in new code. `type` defaults to `"button"`. `className="folded"` turns its top-right corner down (pair with a trailing arrow icon); `.k-gift` makes a chip a hung gift tag. |
| `Card` | `card.tsx` | `div` props + `tone?: "accent" \| "flat"`, `interactive?` | Padding is the caller's. |
| `Tape` | `tape.tsx` | `{ seed: string }` | Washi tape across the middle of a sheet's top edge. Tint, width and angle come from `seed`. Parent must be positioned and not clip. Used sparingly: Jongi's card, home's Continue card, streak box, needs-you cards. |
| `ChatThread` | `chat-thread.tsx` | `{ children, className?, label?, replay? }` | `role="log"`, polite live region. `replay` for threads that open on saved history: what is there on mount shows at once, later lines still fade in. |
| `CompanionLine` | `chat-thread.tsx` | `{ children, typing?, delayMs? = 520, continued?, mood?: JongiMood, onShown? }` | `typing` only for new lines, not history on reload. Show the step's `OptionTiles` after `onShown`. Avatar: a 32px round-tile Jongi. (Was `NibblesLine`.) |
| `LearnerEcho` | `chat-thread.tsx` | `{ children, verdict?: "good" \| "miss" }` | The Learner's pick, on the right. |
| `ThreadCard` | `chat-thread.tsx` | `{ title?, sub?, children?, flush?, className? }` | Plan, progress panel, score inside the thread. |
| `OptionTiles<T>` | `option-tiles.tsx` | `{ options: OptionTile<T>[], onPick(option), label, cols?: 1 \| 2 \| 3 = 2, flush?, judge?(option) => "good" \| "miss" \| null, correctId?, keyboard? = true, resetKey?, className? }` | Locks after a pick (also while `onPick`'s promise runs). Keys 1–9 go to the newest unlocked group. Quiz: `judge` + `correctId` → good bursts, miss shakes and reveals. Change `resetKey` to unlock. |
| `OptionTile<T>` (type) | `option-tiles.tsx` | `{ id, label, description?, icon?, tone?: "default" \| "primary" \| "quiet", unsure?, disabled?, value?: T }` | `unsure` = quiet tone + help icon ("Not sure"). |
| `CourseCard` | `course-card.tsx` | `{ course: CourseListItem, sub?, segments?: SegmentState[], metaLeft?, metaRight?, className? }` | Home card. Links to `course.href` when set. |
| `CourseRow` | `course-row.tsx` | `{ course: CourseListItem, active? }` | Sidebar line. Wrap rows in `.k-clist`. |
| `CourseIcon` | `course-icon.tsx` | `{ name: CourseIconName \| string, size? = 18, className? }` | Unknown names fall back to `generic`. |
| `Dialog` | `dialog.tsx` | `{ open, title, onClose, children?, actions? }` | Focus trap, Esc/backdrop close, focus returns to opener. |
| `ConfirmDialog` | `dialog.tsx` | `{ open, title, body, confirmLabel, cancelLabel? = "Cancel", danger?, busy?, onConfirm, onCancel, extra? }` | `busy` disables both buttons and blocks closing. |
| `Input` | `input.tsx` | `input` props + `trailing?`, `invalid?`, `fieldClassName?` | Needs a visible `<label>` or `aria-label`. `fieldClassName` styles the wrapper. |
| `Textarea` | `input.tsx` | `textarea` props + `invalid?`, `fieldClassName?` | |
| `Loader` | `loader.tsx` | `{ size? = 96, label?, className? }` | Being replaced by the page-flip loader (SEN-97 phase 1). Under 48px renders inline (no dots/label): use 18–24 in buttons and rows, 72–96 for a panel. |
| `PageLoader` | `loader.tsx` | `{ label? = "Loading…" }` | Centred, for a whole screen. Invisible for its first 300 ms, so fast loads don't flash it. |
| `Logo` | `logo.tsx` | `{ size? = 28, tile?, className? }` | Jongi's folded paper head in a scholar cap (fixed paper colours). `tile` puts it on the ink-navy rounded tile (32px and up). Same markup as the favicon `public/jongi-logo.svg`. |
| `BrandLink` | `logo.tsx` | `{ size? }` | Logo + wordmark linking Home. Used by `AppShell`. |
| `SegmentedProgress` | `progress.tsx` | `{ segments: SegmentState[], label, className? }` | `SegmentState = "todo" \| "done" \| "now" \| "writing" \| "miss"`. |
| `ProgressBar` | `progress.tsx` | `{ value: 0..1, label, className? }` | |
| `ProgressRing` | `progress.tsx` | `{ value: 0..1, size? = 64, stroke? = 5, label, children?, className? }` | `children` replaces the % text; `null` shows none. |
| `EmptyState` | `states.tsx` | `{ title, children?, actions?, className? }` | Jongi (tracking) + one clear next step. `ErrorState` shows Jongi thinking. |
| `ErrorState` | `states.tsx` | `{ title? = "That didn't load", children?, actions?, className? }` | `role="alert"`. Say what happened and what's next; offer Try again when there is one. |
| `ToastProvider` | `toast.tsx` | `{ children }` | Wraps the app (in `App.tsx`). |
| `useToast()` | `toast.tsx` | returns `toast({ title, body?, tone?: "default" \| "celebrate" \| "error", durationMs? = 3200 })` | |

## Libraries — `src/lib/`

| Export | File | Notes |
| --- | --- | --- |
| `COMPANION_NAME`, `PRODUCT_NAME` | `brand-marks.ts` | `"Jongi"`, `"Knibbler"`. Always use the constants. |
| `COURSE_ICON_PATHS`, `CourseIconName`, `pickCourseIcon(subject)` | `brand-marks.ts` | Names: `norse`, `knot`, `greek`, `music`, `yggdrasil`, `sourdough`, `investing`, `microscope`, `drum`, `generic`. `pickCourseIcon` is a keyword heuristic until the plan step stores an icon per Course. |
| `logoMarkup({ tile? })` | `brand-marks.ts` | The mark's SVG string, behind `Logo` and `public/jongi-logo.svg`. |
| `cheer(el, text?)`, `confetti(x, y, opts?)`, `confettiAt(el, opts?)`, `prefersReducedMotion()` | `cheer.ts` | Rewards: a small burst plus a floating "✓ text" chip. Keep it to real moments (lesson read, right answer, course done). |
| `CourseListItem`, `CourseListStatus`, `LibraryItem`, `toCourseListItem(item)`, `sidebarCourses(items)`, `notifyLibraryChanged()` | `course-list.ts` | Maps `/api/library` rows to plain words: `learning`, `making`, `needs`, `done`, `stopped`. Glossary statuses stay in code. The sidebar list reloads on navigation, on window focus, every 5 s while a course is being made or a Course Request is open, and when a screen calls `notifyLibraryChanged()` after an action that changes a status. |
| `DAILY_GOAL_MINUTES`, `addStudyMinutes(n)`, `readActivity()`, `ActivitySummary` | `study-activity.ts` | Local streak and minutes for the companion card. |

**Removed in SEN-97:** the 5 palettes and their API (`PALETTES`, `usePalette`, `applyPalette`, `initPalette`, `readPalette`, `PalettePicker`, the palette-following favicon), `Nibbles` (`nibbles.tsx`), `NibblesLine`, `cappedNibblesMarkup` and the `--nib-*` tokens. The favicon is static.

## Rules for screens

- **Always dark.** Never add light-mode styles; colour comes from tokens (one Papercraft palette).
- **Chat-like flows:** after the subject, the Learner only taps `OptionTiles` placed directly under the latest `CompanionLine`. Clarification answers are options, not free text.
- **Copy:** plain words, no glossary terms in UI ("being made", "needs you", not `blueprint_preparing`). Failures say what happened and what's next.
- **Accessibility:** every control has a name; keep focus rings; don't trap focus outside `Dialog`; motion respects reduced motion.
- **Sidebar:** never scrolls. Screens put content in the main area or, for Study, in `ShellOutline` (which must fit).
- **Header** is always present, in every reading mode.
