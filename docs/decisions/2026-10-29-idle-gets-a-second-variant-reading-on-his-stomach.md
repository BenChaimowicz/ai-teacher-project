---
date: 2026-10-29
tickets: SEN-104
people: Ben
status: active
---

# Idle gets a second variant: Jongi lies on his stomach reading the open book and flips a page

SEN-104's contract has four states, with a single Idle loop. Ben added a second idle mode. Jongi lies on his stomach behind the open book, with his chin over its top edge and his forearms on the pages. His short, puffy hind legs rest on the ground in front of his haunch, and his tail wiggles above him. His eyes scan the lines, and once per loop a paw lifts the right page and turns it. In the `.blend` it is the 8-second action `Jongi.IdleReading`, beside the 4.2-second sitting `Jongi.Idle`.

**Why:** A single idle loop gets repetitive on screens where Jongi sits for a long time. Reading the book is the most in-character thing he can do while waiting. The alternative was to keep one sitting idle and only vary its blinks and twitches, which costs nothing extra but never changes his silhouette.

**What it costs:** Cut paper can't bend the sitting body into a lying one, so the pose swaps parts instead. The sitting body, feet and chest ribbon hide, a lying torso, haunch and grounded hind legs appear, and the book slides forward in depth. The swap between sitting and lying is hidden behind the smoke-puff transition (see `2026-10-29-idle-alternates-and-every-switch-cuts-behind-a-smoke-puff`). It is one more sprite sheet to render and ship, and the longest one, because the loop is 8 seconds. `mood="idle"` alternates between the two variants by itself.
