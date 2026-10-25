# Handoff: Knibbler redesign (SEN-52 → SEN-86/87/88)

Written 2026-10-25, at the end of a long session, so a new session (on another computer) can pick up exactly where this one stopped. Read this first, then `docs/uis/redesign/README.md` and `docs/uis/redesign/09-implementation-notes.md`.

## 1. Where things stand

| Ticket | Branch | PR | State |
| --- | --- | --- | --- |
| SEN-52 Redesign: inspiration and direction | `yardenfarag/sen-52-redesign-inspiration-and-direction` | #26 → `main` | Done apart from the ACs listed in §5. Waiting for Ben's review. |
| SEN-86 Redesign: design system and app shell | `yardenfarag/sen-86-redesign-design-system-and-app-shell` (stacked on SEN-52) | #27 → SEN-52 branch | **Done** (2026-10-25, second session): reference page, contract README, visual pass, e2e 16/16, typecheck and unit tests pass. Ready for review. |
| SEN-87 Rebuild the make-a-Course screens (includes SEN-56) | not started | — | Waiting on SEN-86. |
| SEN-88 Rebuild the learning screens | not started | — | Waiting on SEN-86. |

All of these are in the Linear team **Senoy**, project **Knibbler redesign**, assigned to Yarden. SEN-52 is In Progress, and the others are Backlog. A comment on SEN-86 points to the direction docs.

## 2. What the user decided (do not re-litigate)

The full list is in `docs/uis/redesign/09-implementation-notes.md`. The spec is updated in `docs/spec.md` §1 (out of scope), §3 and §4.1.

- **Companion:** **Nibbles**, a hamster. The name may change later, so keep it in one constant (`COMPANION_NAME` in `apps/web/src/lib/brand-marks.ts`).
  - Voice: low-key, kind, brief. It has character but is never tacky, childish or talkative.
- **Chat-*like* flow, not a chat.** After the Learner gives the subject, they only tap options. The topic is the only free text.
  - Options sit directly under Nibbles' line, as big tiles with an icon, a short description and number keys. Not thin rows at the bottom of the screen.
- **Theme:** always dark, with 5 switchable accent palettes:
  - amethyst: purple / light blue (default)
  - rose: red / pink
  - honey: yellow / brown
  - matcha: light green / orange
  - slate: grey / flashes of blue

  Accents are fairly dominant; glow is subtle.
- **Sidebar:** techy, minimal, and **never scrolls**.
  - A compact Nibbles card:
    - a real speech bubble (not an input-looking box)
    - eyes follow the mouse; ear twitch on hover; click shows another line
    - streak and a today-minutes ring
  - New course.
  - One line per course, 4–5 at most, then "see all on Home".
  - "How you like to learn" pinned at the bottom.
- **No seeds, XP or levels for now.** The user found them weird. Rewards are confetti plus a "✓ …" chip, streaks, ticks and count-ups.
- **Logo:** Nibbles' *silhouette* (head + ears) in a graduation cap, with no face, in the palette gradient. The favicon follows the palette. The full face is for the companion and the loader.
- **Loading animation:** the capped Nibbles hops.
- **Course icons:** each course gets a fitting icon, e.g. Mjölnir for Norse mythology and a necktie for the square knot. In the real app it is picked at plan time from a curated library (`08-course-icons.md`).
- **Home:**
  - Grouped: continue, learning, being made, needs you, finished.
  - Everything shares one left edge (the user flagged the misalignment).
  - First run asks "What would you like to learn?".
- **"How you like to learn" (SEN-56):**
  - A conversation with **7** questions. The language question is removed because the app is English only, but the course-making LLM prompts must say English only.
  - A live summary panel where you can change each answer.
- **Study:**
  - Lesson text defaults to **Manrope** (`font-family: Manrope, ui-sans-serif, system-ui, sans-serif`). Serif is optional.
  - The **header is always present** in every reading mode, Focus and Book included, with the sidebar toggle and Home.
  - An **Aa** reading panel offers:
    - modes: Comfort, Focus, Spaced, Book, Skim
    - fine controls: font, size, width, line spacing, letter spacing
    - page colour: Dark, Dim, Sepia, Paper
    - a "Help me pick" font test

  The user loved the timeline figure and "Worth knowing" notes.
- **Quiz:** one question at a time. A right answer glows green, a wrong one shakes and the correct one is revealed. The mock also shows an adaptive "I added a short lesson" path change, which is SEN-79 exploration only; the spec still says Quizzes don't rewrite the path.
- **Still open, for the user to decide:**
  - Keep the Sepia and Paper reading surfaces, or ship dark only? Everything is in the mock for them to choose from.
  - Which reading modes ship first.

## 3. The mocks (visual reference)

`docs/uis/redesign/`. Open the files directly from disk; they share `kit.css` and `kit.js`.

| File | What it shows |
| --- | --- |
| `04-home.html` | Home; the mock pill switches between returning and first run |
| `02b-new-course.html` | New course |
| `03b-study.html` | Reading with the Aa panel, Quiz and Course complete; the mock pill switches between them |
| `06-how-you-learn.html` | How you like to learn |
| `07-brand.html` | Logo, favicon, loader, course icons |
| `00-critique.md` | Critique of the current app |
| `05-reading-modes.md` | Reading research |
| `08-course-icons.md` | How courses get icons |
| `README.md` | Index |

Superseded: `01`, `02`, `03` (kept for comparison).

## 4. SEN-86: what's built and what's left

**Built** (commit `767fa34` plus the handoff commit), in `apps/web/src`:

- **Tokens** (`styles/kit.css`, `styles/shell.css`, `index.css`):
  - the 5 palettes via `data-theme`, with `color-mix` surfaces
  - fonts self-hosted with `@fontsource`: Manrope, JetBrains Mono, Literata, Atkinson Hyperlegible
- **Palette** (`lib/theme.ts`): `PALETTES`, `usePalette()`, `applyPalette`, `initPalette` (localStorage).
  - The picker is `components/shell/palette-picker.tsx`.
- **Shell** (`components/shell/app-shell.tsx`):
  - `AppShell({variant: "workspace" | "study"})`, `useShell()`
  - slot portals: `ShellTitle`, `ShellActions`, `ShellOutline` (the Study sidebar outline)
  - `SidebarCourses` (`sidebar-courses.tsx`) uses `lib/course-list.ts` (`toCourseListItem`, `sidebarCourses`)
  - `workspace-layout.tsx` and `open-items.tsx` are deleted.
- **Companion:**
  - `components/companion/companion-card.tsx`
  - `companion-provider.tsx`: `CompanionProvider`, `useCompanion()`, `useCompanionLines(lines)`, `DEFAULT_COMPANION_LINES`
  - `lib/study-activity.ts`: `DAILY_GOAL_MINUTES`, `addStudyMinutes`, `readActivity` (localStorage streak and minutes)
- **UI** (`components/ui/`):

  | File | Exports |
  | --- | --- |
  | `button.tsx` | Button |
  | `card.tsx` | Card |
  | `chat-thread.tsx` | ChatThread, NibblesLine, LearnerEcho, ThreadCard |
  | `course-card.tsx` | CourseCard |
  | `course-icon.tsx` | CourseIcon |
  | `course-row.tsx` | CourseRow |
  | `dialog.tsx` | Dialog, ConfirmDialog |
  | `input.tsx` | Input, Textarea |
  | `loader.tsx` | Loader, PageLoader |
  | `logo.tsx` | Logo, BrandLink |
  | `nibbles.tsx` | Nibbles, with moods idle / think / cheer and pointer tracking |
  | `option-tiles.tsx` | OptionTiles, with verdicts good / miss and keys 1–9 |
  | `progress.tsx` | SegmentedProgress, ProgressBar, ProgressRing |
  | `states.tsx` | EmptyState, ErrorState |
  | `toast.tsx` | ToastProvider, useToast |

- **Brand** (`lib/brand-marks.ts`): `COMPANION_NAME`, `PRODUCT_NAME`, `logoMarkup`, `cappedNibblesMarkup`, `COURSE_ICON_PATHS`, `pickCourseIcon(subject)` (a heuristic placeholder).
- **Effects** (`lib/cheer.ts`): `confetti`, `confettiAt`, `cheer(el, text)`, `prefersReducedMotion`.
- **Favicon:** `public/nibbles-logo.svg`. Check that the palette-following favicon is wired in.
- **Existing pages** re-skinned only as far as needed to sit in the shell: `study.tsx`, `course-complete.tsx`, `course-request-control.tsx`, `confirm-dialog.tsx`. Behaviour and API calls are unchanged.

**Left to do for SEN-86:** all done in the second session (commits `b2df95a`, `27a2c76`, `4da8052`). Kept for the record:

1. **Component reference page:** `pages/dev-components.tsx` at `/dev/components` is a placeholder. It should show every component in every state, plus the palette picker.
2. **Contract README:** write `apps/web/src/components/README.md` (component names, props, file paths). This is the contract for the SEN-87 and SEN-88 agents.
3. **Visual pass:**
   - Run `pnpm --parallel --filter @senoy/web --filter @senoy/api dev` (web on 127.0.0.1:5173).
   - Take screenshots with Playwright, from inside `e2e/` (where `@playwright/test` resolves).
   - Compare against the mocks and fix the gaps.
   - Check:
     - companion eyes and click lines
     - palette switch and favicon
     - responsive drawer on narrow screens
     - skip link, focus rings, Esc closes the drawer
     - AA contrast
4. **Sidebar no-scroll e2e test:** `scrollHeight <= clientHeight` at 1440×900 and 1280×720.
5. **Run e2e** (`pnpm test:e2e`) and update tests only where labels changed:
   - "Workspace" → logo / Home
   - "New Course Request" → "New course"
   - "Teaching Profile" → "How you like to learn" in nav
6. **Full checks:** `pnpm typecheck` and `pnpm test`.
7. **Finish the PR:** mark it ready, against the SEN-52 branch.

**SEN-86 out of scope:** rebuilding flows (SEN-87/88), reading modes, the conversational profile, backend or schema changes, and LLM-picked course icons (a follow-up).

**Found in the visual pass, worth knowing for SEN-87/88:**

- `.k-tile`'s entrance animation used fill `both`, which held `opacity`/`transform` and silently broke hover, locked-group dimming and disabled tiles. Entrance animations on elements that later change state must use `backwards`.
- `--faint` is now `#908ea1` (AA on `--panel` in every palette).
- `e2e/run.ts` now works on Windows (pnpm is spawned through a shell). Docker Desktop must be running.
- `confirmedRequest()` in `e2e/tests/fixture.ts` resets the database; use `addWaitingRequests(n)` to add more.

## 5. SEN-52 acceptance criteria not met (listed in PR #26)

- No moodboard of real products yet.
- The 16 older mockups in `docs/uis/` haven't been reviewed. `settled-pim.html` doesn't exist in the repo, so the ticket text needs fixing.
- One direction was iterated instead of 2–3 parallel ones.
- The direction needs agreement from both Yarden and Ben.

## 6. Next: SEN-87 and SEN-88 in parallel, after SEN-86

The user wants multi-part builds split across parallel agents, after the shared contract is committed. That contract is SEN-86's components plus the README.

Give each agent its own git worktree, branched from the finished SEN-86 branch. Each agent gets disjoint files, opens its own PR stacked on SEN-86, and does not write to the shared Supabase database beyond normal dev and e2e.

- **SEN-87, make-a-Course screens + SEN-56.** Rebuild these in the chat-like style of `02b-new-course.html` and `06-how-you-learn.html`:
  - Teaching Profile setup: 7 questions, Q1 hidden and resolved to `en`, keeping the SEN-33 data contract
  - Course Request: Compose, Validity pass / clarify / reject
  - Starting Level check
  - Blueprint review: plan card with untick and Step by step / Jump around
  - Generation waiting screen: stages, current lesson, leave and come back, Cancel / Resume
  - Every failure state, including SEN-83's Try again

  Also:
  - Server steps that don't need the Learner start automatically.
  - Clarification answers are offered as options.
  - Generator prompts state English only.
  - Existing e2e tests pass.
- **SEN-88, learning screens.** Rebuild these like `04-home.html` and `03b-study.html`:
  - Home: grouped, first run, needs-you with honest Retry copy, older attempts collapsed
  - the Course page and outline in the sidebar
  - Reading: Manrope default, the Aa reading panel with modes stored per Learner, the header always present, the end-of-lesson "I've read it" prompt
  - Quiz: one question at a time with per_item / end_of_quiz behaviour as in spec §3
  - Course complete: stats, count-ups, next-step options

  The SEN-84 finish line is restyled, not rebuilt. Existing e2e tests pass.

## 7. Practical notes for the new session

- **Repo:** pnpm monorepo.
  - `apps/web`: React, react-router, Tailwind v4.
  - `apps/api`: Fastify, port 3000.
  - `apps/worker`.
  - `apps/console`: a separate Usage Console, ports 3100 / 5174.
  - `e2e`: Playwright.
  - `pnpm apps` opens a terminal dashboard to toggle dev servers.
- **Git:**
  - The user switches branches between turns. Always check the current branch before committing, and never commit or push to `main`.
  - Commit messages are prefixed with the ticket (e.g. "SEN-86 …") and end with the Co-Authored-By line.
- **Agents got cut off twice by host restarts.** Agents should commit small and often.
- **Screenshots so far** were written to `C:/tmp/sen52shots/`. These are local only and not in the repo.
- **T3 orchestration MCP:** couldn't connect this session, so PR #26 was not registered with the T3 thread. It is attached to SEN-52 in Linear.
