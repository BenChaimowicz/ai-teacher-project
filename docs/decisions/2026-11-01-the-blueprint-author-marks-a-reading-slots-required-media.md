---
date: 2026-11-01
tickets: SEN-115, SEN-50, SEN-48
people: Ben
status: active
---

# The Blueprint author marks a Reading slot's required media, as a Media category and Topic tags taken from what the catalog holds

The Blueprint author is shown the media catalog's categories and the Topic tags in each one. On any Reading slot whose Lesson cannot teach without the Learner seeing something (a grip, a stroke, a rock beat on the staff, a Gram-stained field), it lists that slot's required media: a category and tags from that category. The schema offers only what the catalog holds, and a Blueprint Code check confirms that each request has a catalog file to fill it. So the requirement is fixed when the Blueprint is approved, before research, and Retry, resume, a repair and the fallback author all ask for the same images. The Reading writer still chooses where each required image goes and writes its caption and alt text, and it may add optional images of its own. Learner review shows titles and Lesson goals only, so the Learner never sees or edits the requirement.

**What we turned down:** letting the Reading writer mark each image it asks for as required or optional. It needs no Blueprint change, but a fresh draft or the fallback author could decide differently from the first, and fixing the requirement before the Reading is written would have needed an extra model call before drafting.

**What it costs:** a bigger Blueprint prompt and schema, and the requirement is decided before anyone has seen the Sources. Because the author may ask only for what the catalog holds, a gap in the catalog shows up as a missing requirement rather than as an error, so the live test-course Blueprints have to be read against spec §7 to find gaps.
