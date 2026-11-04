---
date: 2026-11-04
tickets: SEN-121, SEN-129
people: Yarden
status: active
---

# Technique photos are found by a smarter search that remembers what worked, never by a person adding them to the library

**Why:** On 2026-11-04 the drum grip got no picture in two live runs. The cause was the search, not a lack of photos. Openverse found four CC BY grip photos on Commons on its first try ("Drumstick mached grip", "Regular grip left hand", "French grip right hand 01", "German grip right hand 01"), all in `Category:Drumsticks`. Our Commons search builds word lists by rule and matches them exactly, so a misspelt title and the term "regular grip" could never match.

We turned down a person finding and adding grip photos by hand. It would fix drums once and teach the system nothing for the next technique. The follow-up ticket instead makes the search better:

- A cheap model writes and refines the queries the way a librarian would, and browses the Commons category of a good hit.
- Openverse is a second search index. Every file's licence is still checked on its own page.
- A cheap low-detail pass screens many thumbnails before the harsh Judge sees the best few.
- The search route that found a passing file is remembered per Media category, so every Course makes the next search start in the right place.

We did not take a hand-free technique schematic as a last resort for now. A technique without a good photo still shows nothing, as decided on 2026-11-03.

SEN-121 ships first with "technique visuals often miss" as a known limit.
