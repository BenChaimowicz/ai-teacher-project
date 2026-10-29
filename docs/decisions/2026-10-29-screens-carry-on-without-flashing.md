---
date: 2026-10-29
tickets: SEN-97
people: Yarden
status: active
---

# Screens carry on without flashing: no loader between Compose and its Request, no replayed fade-ins, the page loader waits 300 ms

**Why:** Yarden noticed that picking a topic made the screen flick before Jongi's next lines. Saving the topic sent you to the Request page, which threw the conversation away, showed a half-screen loader while it fetched the record it had just been given, then faded every line in again at once. Now:

- **Hand-over:** New course passes the saved Request in navigation state, so the Request page opens without fetching it again. The state is cleared once read, so a reload fetches fresh and never shows an old status.
- **History:** a thread that opens on saved history (`ChatThread replay`: Course Requests and quizzes) finishes the entrance animations of whatever is there on mount. Only lines added later fade in.
- **Home:** tiles that wait for Jongi's greeting, and the first-run topic card, are laid out from the start, paused before their pop-in, so nothing below them jumps.
- **Loader:** `PageLoader` stays invisible for its first 300 ms, so fast loads show nothing instead of a flash of the big loader. 300 ms is about where a wait starts to feel like one. Screen readers hear the label straight away.
