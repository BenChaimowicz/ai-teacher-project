---
date: 2026-10-29
tickets: SEN-104
people: Ben
status: active
---

# `mood="idle"` alternates between sitting and reading every 20 seconds, and every switch between Jongi's actions except Win cuts behind a fast paper smoke puff

The component picks between the two idle variants on its own: `Jongi.Idle` (sitting) and `Jongi.IdleReading` (lying on his stomach with the book). It switches every 20 seconds of continuous idle. Callers keep passing `mood="idle"`, and no new prop or input is added. Every other time Jongi switches from one action to another, the switch is hidden behind `Jongi.Poof`. It is a 0.56-second cut-paper smoke cloud that covers him completely by 210ms. The app swaps the underlying pose at that moment, and the cloud then breaks apart and drifts away. Win is the exception: it cuts straight in, with no puff.

**Why:** Alternating keeps the call sites unchanged, which is what the ticket asks for ("no call-site changes"). A caller-chosen variant would have meant a new prop that every screen has to decide about. The puff solves the problem the reading idle created: cut paper can't bend a sitting body into a lying one, so the switch is a replacement of parts. A bare swap would look like a glitch. We turned down drawing in-between transitions for each pair of actions, which would be smoother but means one hand-made transition per pair of moods, compared with one reusable cloud.

**What it costs:** Every mood change except Win is delayed by about 0.2 seconds before the new pose shows. Win skips the puff so the celebration lands on the beat. The price is that a Win fired while Jongi is lying down and reading is a hard cut from the lying pose to the hop. The cloud is a separate overlay sprite, rendered without Jongi, that the component plays over whatever Jongi is showing. That makes it one more asset, and the component has to time the swap to `swap_at_ms`. 20 seconds per idle variant means a Learner who sits on one screen sees Jongi change about three times a minute. That's often enough to feel alive, but rare enough that he isn't fidgety.
