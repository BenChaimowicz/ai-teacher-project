# Redesign: decisions for implementation

SEN-52 · 2026-10-25. These were settled while reviewing the mocks in this folder. Implementation agents should follow them. The mocks are the visual reference.

- **No language question.** "How you like to learn" asks 7 questions. Lessons are English only for now, and the course-making LLM prompts must say so explicitly: write lessons, quizzes and feedback in English.
- **No seeds, XP or levels for now.** Rewards are non-numeric: a small confetti burst with a "✓ …" chip, a streak, today's minutes against a daily goal, ticked sections, and count-ups on real stats. The sidebar ring shows today's goal.
- **The companion is called Nibbles.** It's a hamster. Its voice is low-key, kind and brief, never childish. The name may change later, so keep it in one constant.
- **Logo and favicon.** The mark is Nibbles' silhouette in a graduation cap (see `07-brand.html`, `nibbles-logo.svg`). The favicon follows the current palette. The full face is for the companion and the loader.
- **Lesson text defaults to Manrope.** Serif (Literata) and Hyperlegible stay available in the Aa reading panel.
- **The study header is always present**, in every reading mode, Focus and Book included. It has the sidebar toggle and a way back to Home, so nobody gets stuck in a lesson.
- **Every course has an icon.** It's picked at plan time from a curated library (see `08-course-icons.md`) and shown on Home cards and sidebar rows.
- **The sidebar never scrolls.** It shows a compact Nibbles card, New course, one line per course (4–5 at most, then "see all on Home"), and "How you like to learn" pinned at the bottom.
- **Options only after the subject.** The topic is the only free text. Everything after it is tap-to-choose tiles placed right under Nibbles' line.
- **Always dark**, with 5 accent palettes. Sepia and Paper are offered only as optional *reading surfaces* inside the Aa panel. Keeping them is still pending the user's decision.
