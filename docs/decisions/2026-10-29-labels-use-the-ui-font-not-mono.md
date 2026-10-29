---
date: 2026-10-29
tickets: SEN-97
people: Yarden, Ben
status: active
---

# Small labels and meta lines use the UI font; JetBrains Mono is kept for code and keys only

**Why:** Yarden didn't like the mono look on lines like "+2 more · see all on Home →", and the Papercraft mock used it for every small label: section heads, ribbons, lesson numbers, quiz meta. We turned down swapping in a softer mono (IBM Plex Mono, Geist Mono), because the problem was the typewriter voice, not this particular mono. Labels now read `--font-label`, which points at Space Grotesk, so the "techy" note the mono gave the sidebar is gone, and kept apart from `--font-code` so labels can move again without touching keyboard keys.
