# PROTOTYPE — RPG Course map (SEN-144)

Throwaway. Not the product.

A fantasy map with one hand-drawn route. Lesson locations are placed in code along the route, the path draws itself up to the current Lesson, Quizzes are boss battles and the Goal Check is the final boss. The showcase is the real Norse Course "Norse Gods and Their Fates". It imports nothing from `apps/` or `packages/` and makes no network calls.

```bash
npm install
npm run dev        # http://127.0.0.1:5175/  (5174 is taken by the apps/console dev server on this machine)
npm test           # route placement, path timing, marker sizes (vitest)
npx tsc --noEmit   # typecheck
npm run build      # typecheck + production build
```

To run it without the script: `npx vite --host 127.0.0.1 --port 5175`.

## Controls

- **Course**: 3 Lessons (the first three of the real Course, no Quiz), 16 (the real Course), 30 (long test for crowding). The Goal Check is always the last stop.
- **Placement**: *even* spaces every stop equally; *clustered* huddles the Readings between two Quizzes into one region (at least 46 map px apart) with the Quiz at its end, and gives the rest of the route to the travel between regions.
- **Route**: *main* or *long*. Picking a Course chooses the route (30 → long, otherwise main); you can override it.
- **Width**: Desktop, or Phone (pins the map to 390 px).
- **Back / Next** move the current Lesson; **Replay** clears the path and draws it again.
- Hover, focus or tap a marker to read its card and see its map tag.

## Where the pieces are

- `art/map-01.png` the base map; `art/route-01.json` the hand-drawn routes (`main`, `long`); `art/*.svg` the cut-paper characters (hero, location, visited, locked, boss, final boss).
- `data/` the Courses (`norse-16.json`, `norse-30.json`), the verbatim published Course (`norse-16-source.json`) and the types.
- `src/route.ts` placement maths, `src/motion.ts` path timing, `src/design.ts` sizes and anchors from `.teamwork/design.md`, `src/tokens.css` design tokens.
- `screenshots/` browser checks (desktop 16-Lesson clustered and even, phone 31-stop, phone toggle, boss-battle card, final-boss card, mid-animation).
