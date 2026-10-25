# Components: the redesign contract (SEN-86)

This is the shared contract for screens built on the redesign (SEN-87 make-a-Course, SEN-88 learning). Screens compose these pieces; they do not restyle them. If a screen needs something new, add it here (component, README row, `/dev/components` section) rather than inlining a one-off.

- **See them live:** `/dev/components` (`src/pages/dev-components.tsx`) shows every component in its states, plus the palette.
- **Visual reference:** the mocks in `docs/uis/redesign/` (`02b-new-course.html`, `03b-study.html`, `04-home.html`, `06-how-you-learn.html`, `07-brand.html`).
- **Decisions:** `docs/uis/redesign/09-implementation-notes.md`. In short: always dark, 5 accent palettes, chat-*like* flows where the topic is the only free text, Nibbles is low-key and brief, no XP/seeds/levels.

Imports use the `@/` alias and the `.tsx` / `.ts` extension, e.g. `import { Button } from "@/components/ui/button.tsx"`.

## Tokens

Defined in `src/index.css` (`:root`) and `src/styles/kit.css` (component classes). Use the CSS variables, not hex values.

| Token | Use |
| --- | --- |
| `--a`, `--b` (`--a-rgb`, `--b-rgb`) | Accent pair from the palette. Gradients go `--a` → `--b`. |
| `--on-a` | Text on a filled `--a` surface. |
| `--bg`, `--bg-2`, `--panel`, `--panel-2` | Surfaces, tinted by the accent. |
| `--line`, `--line-2`, `--a-soft`, `--a-line`, `--b-soft`, `--glow` | Borders, soft fills, subtle glow. |
| `--text`, `--read`, `--text-muted`, `--faint` | Text: UI, lesson body, secondary, tertiary. Muted and faint pass AA on `--bg`. |
| `--good`, `--miss` | Right / not quite. |
| `--font-ui` (Manrope), `--font-code` (JetBrains Mono), `--font-book` (Literata), `--font-legible` (Atkinson Hyperlegible) | Lesson text defaults to `--font-ui`. |
| `--dur-fast`, `--dur`, `--dur-slow`, `--ease-pop` | Motion. Respect `prefersReducedMotion()`. |

The shadcn names (`bg-background`, `text-muted-foreground`, `border-border`, …) are mapped onto these, so Tailwind utilities follow the palette too. Small shared classes: `.k-mono`, `.k-sec-h` (mono section heading with a rule; `.n` child for a count).

## Shell — `components/shell/`

| Export | File | Props / API | Notes |
| --- | --- | --- | --- |
| `AppShell` | `app-shell.tsx` | `{ variant: "workspace" \| "study" }` | Route layout (renders `<Outlet />`). Sidebar never scrolls; drawer below 900px; Esc/backdrop close it; skip link to `#main`. |
| `useShell()` | `app-shell.tsx` | `{ variant, sidebarOpen, setSidebarOpen(open), setReadingProgress(0..1 \| null), slots }` | Throws outside `AppShell`. Reading progress resets on navigation. |
| `ShellTitle` | `app-shell.tsx` | `{ children }` | Top bar title. Without it, a default title from the path shows. |
| `ShellActions` | `app-shell.tsx` | `{ children }` | Top bar, right side (Aa panel button, course menu). |
| `ShellOutline` | `app-shell.tsx` | `{ children }` | Study variant only: sidebar content below the companion card (the Course outline). |
| `SidebarCourses` | `sidebar-courses.tsx` | none | Workspace sidebar course list (max 5, then "see all on Home"). Used by `AppShell`. |
| `PalettePicker` | `palette-picker.tsx` | none | Sidebar footer swatches. Used by `AppShell`. |

## Companion — `components/companion/`

| Export | File | Props / API | Notes |
| --- | --- | --- | --- |
| `CompanionProvider` | `companion-provider.tsx` | `{ children }` | Wraps the app (in `App.tsx`). Counts a study minute per 60s on visible `/study/` pages. |
| `useCompanion()` | `companion-provider.tsx` | `{ line, lineId, mood, activity, say(text, mood?), next(), setMood(mood), setLines(lines \| null) }` | `"cheer"` mood falls back to idle after ~2s. |
| `useCompanionLines(lines)` | `companion-provider.tsx` | `string[]` | Sets the sidebar lines while a screen is mounted. **Pass a stable array** (module constant or `useMemo`). |
| `DEFAULT_COMPANION_LINES` | `companion-provider.tsx` | `string[]` | |
| `CompanionCard` | `companion-card.tsx` | none | Sidebar card: speech bubble, eye tracking, ear twitch, click for another line, streak, today-minutes ring. Used by `AppShell`. |

Lines are one or two short sentences: kind, low-key, never childish or chatty. Use `COMPANION_NAME`, never a hard-coded "Nibbles".

## UI — `components/ui/`

| Export | File | Props | Notes |
| --- | --- | --- | --- |
| `Button`, `buttonVariants` | `button.tsx` | `button` props + `variant?: "primary" \| "secondary" \| "ghost" \| "quiet" \| "danger" \| "link"`, `size?: "default" \| "sm" \| "lg" \| "icon"`, `asChild?` | `asChild` wraps a `Link`. Aliases `default`/`outline`/`destructive` exist for older screens; don't use them in new code. `type` defaults to `"button"`. |
| `Card` | `card.tsx` | `div` props + `tone?: "accent" \| "flat"`, `interactive?` | Padding is the caller's. |
| `ChatThread` | `chat-thread.tsx` | `{ children, className?, label? }` | `role="log"`, polite live region. |
| `NibblesLine` | `chat-thread.tsx` | `{ children, typing?, delayMs? = 520, continued?, mood?, onShown? }` | `typing` only for new lines, not history on reload. Show the step's `OptionTiles` after `onShown`. |
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
| `Loader` | `loader.tsx` | `{ size? = 96, label?, className? }` | Capped Nibbles hopping. Under 48px renders inline (no dots/label): use 18–24 in buttons and rows, 72–96 for a panel. |
| `PageLoader` | `loader.tsx` | `{ label? = "Loading…" }` | Centred, for a whole screen. |
| `Logo` | `logo.tsx` | `{ size? = 28, className? }` | Silhouette in a cap, palette gradient. |
| `BrandLink` | `logo.tsx` | `{ size? }` | Logo + wordmark linking Home. Used by `AppShell`. |
| `Nibbles` | `nibbles.tsx` | `{ size? = 36, mood?: "idle" \| "think" \| "cheer", track?, className?, style?, label? }` | Decorative unless `label` is set. `track` = pupils follow the pointer. |
| `SegmentedProgress` | `progress.tsx` | `{ segments: SegmentState[], label, className? }` | `SegmentState = "todo" \| "done" \| "now" \| "writing" \| "miss"`. |
| `ProgressBar` | `progress.tsx` | `{ value: 0..1, label, className? }` | |
| `ProgressRing` | `progress.tsx` | `{ value: 0..1, size? = 64, stroke? = 5, label, children?, className? }` | `children` replaces the % text; `null` shows none. |
| `EmptyState` | `states.tsx` | `{ title, children?, actions?, className? }` | Nibbles + one clear next step. |
| `ErrorState` | `states.tsx` | `{ title? = "That didn't load", children?, actions?, className? }` | `role="alert"`. Say what happened and what's next; offer Try again when there is one. |
| `ToastProvider` | `toast.tsx` | `{ children }` | Wraps the app (in `App.tsx`). |
| `useToast()` | `toast.tsx` | returns `toast({ title, body?, tone?: "default" \| "celebrate" \| "error", durationMs? = 3200 })` | |

## Libraries — `src/lib/`

| Export | File | Notes |
| --- | --- | --- |
| `COMPANION_NAME`, `PRODUCT_NAME` | `brand-marks.ts` | The companion's name may change; always use the constant. |
| `COURSE_ICON_PATHS`, `CourseIconName`, `pickCourseIcon(subject)` | `brand-marks.ts` | Names: `norse`, `knot`, `greek`, `music`, `yggdrasil`, `sourdough`, `investing`, `microscope`, `drum`, `generic`. `pickCourseIcon` is a keyword heuristic until the plan step stores an icon per Course. |
| `logoMarkup`, `cappedNibblesMarkup` | `brand-marks.ts` | SVG strings behind `Logo`, `Loader` and the favicon. |
| `PALETTES`, `PaletteKey`, `usePalette()`, `applyPalette(key)`, `initPalette()`, `readPalette()` | `theme.ts` | `data-theme` on `<html>`, saved in localStorage; the favicon follows. |
| `cheer(el, text?)`, `confetti(x, y, opts?)`, `confettiAt(el, opts?)`, `prefersReducedMotion()` | `cheer.ts` | Rewards: a small burst plus a floating "✓ text" chip. Keep it to real moments (lesson read, right answer, course done). |
| `CourseListItem`, `CourseListStatus`, `LibraryItem`, `toCourseListItem(item)`, `sidebarCourses(items)`, `notifyLibraryChanged()` | `course-list.ts` | Maps `/api/library` rows to plain words: `learning`, `making`, `needs`, `done`, `stopped`. Glossary statuses stay in code. The sidebar list reloads on navigation, on window focus, every 5 s while a course is being made or a Course Request is open, and when a screen calls `notifyLibraryChanged()` after an action that changes a status. |
| `DAILY_GOAL_MINUTES`, `addStudyMinutes(n)`, `readActivity()`, `ActivitySummary` | `study-activity.ts` | Local streak and minutes for the companion card. |

## Rules for screens

- **Always dark.** Never add light-mode styles; colour comes from tokens so all 5 palettes work. Check a new screen in at least two palettes.
- **Chat-like flows:** after the subject, the Learner only taps `OptionTiles` placed directly under the latest `NibblesLine`. Clarification answers are options, not free text.
- **Copy:** plain words, no glossary terms in UI ("being made", "needs you", not `blueprint_preparing`). Failures say what happened and what's next.
- **Accessibility:** every control has a name; keep focus rings; don't trap focus outside `Dialog`; motion respects reduced motion.
- **Sidebar:** never scrolls. Screens put content in the main area or, for Study, in `ShellOutline` (which must fit).
- **Header** is always present, in every reading mode.
