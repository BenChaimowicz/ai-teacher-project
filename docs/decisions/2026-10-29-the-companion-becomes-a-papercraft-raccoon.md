---
date: 2026-10-29
tickets: SEN-104, SEN-97
people: Ben, Yarden
status: active
---

# The companion avatar becomes a raccoon in the Papercraft style, replacing the hamster

SEN-104 started as "recreate Jongi, the hamster, as a properly modelled cute avatar". Ben and Yarden changed the brief: the avatar we model in Blender is a raccoon, not the hamster we already have, and it is still cut paper in the Papercraft look and palette.

**Why:** Ben and Yarden want a raccoon as the companion rather than a better-built version of the existing character. The alternative was the ticket as written, which keeps the hamster's identity and only rebuilds its construction. That would have been the cheaper path, because the existing hamster's proportions, the SEN-97 face and the rig behaviour are already settled.

**What it costs:** The hamster's settled design no longer carries over, including SEN-97's face, which made the "keep SEN-97's face" answer moot. The raccoon needs its own design sign-off from Yarden and Ben. `docs/spec.md` §Companion ("Nibbles, a hamster") and the character description at the top of `jongi.tsx` both describe a hamster and have to change when the raccoon ships. The behaviour contract (the four moods, look-at, `win`, the framings and reduced motion) is not affected.

**What carries over:** The raccoon keeps the hamster's identity props: the tilted scholar cap with its tassel, and the red bookmark ribbon. The ribbon is now pinned to its chest with V-notched tails, instead of trailing from the tail as on the hamster. The Win cap toss and Resting's slipped cap stay as specced. Thinking's three gold diamonds become a thought-bubble trail (small, medium, then a cloud) that pops one bubble at a time, because the diamonds didn't read as thinking. The names stay too: the component is still `Jongi`, and the companion's name constant does not change. Only the word "hamster" changes in the docs.
