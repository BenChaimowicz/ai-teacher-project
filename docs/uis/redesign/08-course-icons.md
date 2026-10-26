# Course icons

SEN-52 · 2026-10-25. Every course gets an icon that fits its subject: Mjölnir for Norse mythology, a tie for the square knot. No more generic books and circles. The mock icons in `kit.js` (`courseIcon(key)`, shown in `07-brand.html`) are hand-drawn placeholders. This is how the real app picks one.

## Proposal

1. **A curated library, not generated art.** Bundle one open icon set and an allowlist of a few hundred subject-like names from it: `hammer`, `music`, `tree-deciduous`, `landmark`, `chef-hat`, `sprout`, `telescope`, `atom`, and so on.
2. **The plan step picks the name.** When the plan (Blueprint) is drafted, the model also returns `icon: "<name>"`, chosen from the allowlist it was given in the prompt, plus one fallback category (`history`, `science`, `music`, `craft`, `food`, `money`, `language`, `nature`, …).
3. **Validate on the server.** If the name isn't on the allowlist, use the category's default icon. If the category is missing too, use the generic sparkle. Never render an icon name that wasn't checked.
4. **Store it on the Course** (`iconName`). Home, the sidebar and the course header all read the same field. Regenerating a plan keeps the icon unless the subject changes.
5. **Render as stroke icons** inside the accent-gradient tile, so every icon follows the palette and they all look like one set.

## Libraries and licences

| Library | Licence | Notes |
| --- | --- | --- |
| [Lucide](https://lucide.dev) | ISC | Same stroke style as our UI icons. ~1,500 icons; good everyday coverage. **Recommended default.** |
| [Tabler Icons](https://tabler.io/icons) | MIT | ~5,000 icons, similar stroke style; wider subject coverage. |
| [Phosphor](https://phosphoricons.com) | MIT | Several weights; good if we later want a filled or duotone style. |
| [game-icons.net](https://game-icons.net) | CC BY 3.0 | Huge, very specific subjects (Mjölnir, Yggdrasil, helmets). Filled style, and **attribution is required** (a Credits page). Use only for subjects the others lack. |

All four allow commercial use. ISC and MIT only require keeping the licence text in the bundle.

## Open questions

- Should a learner be able to change the icon? Cheap to add: a small picker from the same allowlist.
- One set for everything (simple, consistent) vs Lucide plus game-icons for niche subjects (more fitting, but mixes stroke and filled styles). Recommended: Lucide or Tabler only, at least to start.
