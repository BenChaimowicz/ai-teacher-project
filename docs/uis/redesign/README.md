# Knibbler redesign: chosen direction

SEN-52 · 2026-10-25. This is the direction chosen in SEN-52 and the reference for SEN-86 (design system and app shell), SEN-87 (make-a-Course screens), SEN-88 (learning screens) and SEN-56 (conversational Teaching Profile). The mocks are standalone HTML, so open them from disk. They share `kit.css` and `kit.js`.

> **Direction update, 2026-10-26 (SEN-97).** Yarden and Ben chose the **Papercraft** look ([`10-papercraft-jongi.html`](10-papercraft-jongi.html)) and renamed the companion **Jongi**. It's the base for the product and will be fine-tuned in SEN-97. Where this README or the older mocks disagree with it on looks (palette, type, the companion's design, logo), the Papercraft mock wins. The flow and behaviour decisions in [`09-implementation-notes.md`](09-implementation-notes.md) still hold.

## The direction in one paragraph

Knibbler feels like a calm, dark, slightly techy study app with a cute companion, **Nibbles** the hamster. Every flow is chat-*like* without being a chat. Nibbles says one short line, and the Learner taps an option tile directly under it. The only free text is naming what to learn. A compact sidebar is present everywhere and never scrolls. Reading is long-form and comfortable, with reading modes the Learner can change. Progress feels rewarding through streaks, ticks, confetti and count-ups, without points.

## Files

| File | What it is |
| --- | --- |
| [`00-critique.md`](00-critique.md) | Critique of the current app: UI, UX and copy. Explains why the redesign exists. |
| [`01-companions.html`](01-companions.html) | Companion candidates. The hamster was chosen. |
| [`02b-new-course.html`](02b-new-course.html) | New course: topic → goal → a few quick questions → your plan → making → ready. |
| [`03b-study.html`](03b-study.html) | Reading (with the Aa reading modes), Quiz (one at a time, adaptive path change shown for SEN-79) and Course complete. |
| [`04-home.html`](04-home.html) | Home, returning and first run. |
| [`05-reading-modes.md`](05-reading-modes.md) | Research on how people read on a computer, and the reading modes this leads to. |
| [`06-how-you-learn.html`](06-how-you-learn.html) | "How you like to learn" as a short conversation (SEN-56), first time and returning. |
| [`07-brand.html`](07-brand.html), [`nibbles-logo.svg`](nibbles-logo.svg) | Logo (Nibbles' silhouette in a cap), favicon, loader, course icons. |
| [`08-course-icons.md`](08-course-icons.md) | How each Course gets a fitting icon. |
| [`10-papercraft-jongi.html`](10-papercraft-jongi.html) | **The chosen look (SEN-97).** Papercraft: a dark pop-up-book feel, with Jongi as a cut-paper hamster. Shows the companion, Home, New course, Reading, Quiz, Course complete and the design system. No italics. |
| [`10b-papercraft-simplified.html`](10b-papercraft-simplified.html) | A simplified take on Papercraft, kept as a reference for how far to simplify while fine-tuning. Not the chosen look. |
| [`09-implementation-notes.md`](09-implementation-notes.md) | **Decisions list for implementers. Read this first.** |
| [`kit.css`](kit.css), [`kit.js`](kit.js) | Shared tokens and components of the mocks. These are the source for SEN-86's tokens. |
| `02-new-course.html`, `03-study.html` | First iterations, kept for comparison. Superseded by the `b` versions. |

## Design tokens to lift (SEN-86)

- **Palettes.** Always dark. Five accent pairs, set with `data-theme`: amethyst (purple / light blue), rose (red / pink), honey (yellow / brown), matcha (light green / orange), slate (grey / blue). Surfaces derive from the accent with `color-mix(in srgb, var(--a) N%, #0b0b0f)`.
- **Type.** Manrope for UI and lesson text. JetBrains Mono for small labels, counters and stats. Literata and Atkinson Hyperlegible are reading options only.
- **Glow.** Subtle, used on the primary action, the active item, the companion and celebrations. Never on body text.
- **Components.** Option tiles (icon, title, description, number key, stagger-in, picked/good/miss states). Chat rows (companion line with typing dots, Learner echo bubble). Thread cards. Segmented progress. Course row and course card. Companion card (speech bubble, eyes that follow the pointer, click for another line). Toast. Confetti and the cheer chip. Loader. Reading panel.
- **Motion.** Short (150–450ms). Everything respects `prefers-reduced-motion`.

## Spec changes

Recorded in `docs/spec.md` §1 and §3–4.1:

- The Course Guide is now the companion in a chat-like thread with options only.
- A sidebar is present in Study.
- Home is grouped.
- The Teaching Profile is a conversation with 7 visible questions; language is fixed to English.
- Reading modes are added.
- The study header is always present.

## Not decided yet

- Sepia and Paper reading surfaces: keep them or ship dark only.
- Which of the five reading modes ship first.
- The adaptive path change in `03b` is an exploration for SEN-79. The spec still says Quizzes do not rewrite the remaining path.
