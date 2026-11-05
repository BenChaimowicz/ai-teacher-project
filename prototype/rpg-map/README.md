# PROTOTYPE — RPG Course map (SEN-144)

Throwaway. Not the product.

A fantasy map with one hand-drawn route. Lesson locations are placed in code along the route, the path draws itself up to the current Lesson, Quizzes are boss battles and the Goal Check is the final boss. It imports nothing from `apps/` or `packages/` and makes no network calls.

```bash
npm install
npm run dev        # http://127.0.0.1:5174/
npm test           # route placement maths (vitest)
npx tsc --noEmit   # typecheck
npm run build      # typecheck + production build
```

## Controls

- **Course**: 3 Lessons (the first three of the real Course), 16 (the real "Norse Gods and Their Fates"), 30 (long test for crowding). The Goal Check is always the last stop.
- **Placement**: *even* spaces every stop equally; *clustered* huddles the Readings between two Quizzes into one region with the Quiz at its end and gives the rest of the route to the travel between regions.
- **Back / Next**: move the current Lesson. **Replay** redraws the path from the start.
- **Route**: main or long, when the route file has both.
- **Phone / Desktop**: constrains the map to 390 px so you can check readability.

## Where the pieces come from

Art and data are loaded if present and fall back to placeholders, so swapping real files in needs no code change:

- `art/route-01.json` (else `src/placeholder-route.ts`)
- `art/hero.svg`, `location.svg`, `location-visited.svg`, `location-locked.svg`, `boss.svg`, `final-boss.svg` (else `src/placeholder-art.tsx`)
- `data/index.ts` exporting `norse16` and `norse30` (else `src/placeholder-course.ts`)
- Design tokens live in `src/tokens.css`.
