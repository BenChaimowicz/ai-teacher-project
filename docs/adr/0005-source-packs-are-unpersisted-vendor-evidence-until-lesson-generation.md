# Source packs are unpersisted vendor evidence until Lesson generation

Primary research (Parallel Pro) and Secondary research (You.com Research standard) both run for every Lesson topic, at the same time; Secondary research is never a fallback. Two measured Parallel Pro runs on 2026-10-08 took 4 min 32 s and 41 s of vendor-side time (You.com: 13–14 s), so the Parallel call gets a 10-minute limit and You.com 2 minutes. A pack that runs out of time is marked timed out, which is not the same as empty.

A research module returns each Source pack as a typed object and does not write it to the database. No unpublished-Lesson or Generation-job row exists yet to attach it to, so a table now would be keyed to nothing and reshaped by Lesson generation (SEN-43). The CLI writes packs to JSON. The Lesson-generation work decides storage.

Excerpts are the vendor's passages, labelled `excerptOrigin: "vendor"`. Fetching and extracting pages ourselves, which §5.3 needs before anything counts as a quote, is deferred. Wikipedia URLs are stored as their stable `oldid` URL, looked up once per run so both packs pin the same revision. The Source ID is derived from the article, not the revision, so an edit between calls or a later re-pin does not split one page into two IDs. The vendor's written report is kept as `vendorSummary` for debugging only, and the Generator never receives it.

Neither vendor reports cost in its response, so each pack records `estimatedCostUsd` from a configured price table. An empty pack records why it is empty: the vendor returned nothing, or Host policy dropped everything. Rewriting the query and retrying needs a model, so it belongs to Lesson generation.

Rejected: a `source_packs` table now (no owner to key it to); passing the Preference list and Denylist as vendor domain filters (spec §5.3 makes Host policy app-owned, and adapters would duplicate it); running You.com only when Parallel fails (drops cross-index coverage for a saving of about 5¢ per Lesson).

## Update (SEN-82): research runs up front and is stored per slot

Research no longer runs just before each Reading is written. After Approve, the generation job researches every Reading slot at once. Each slot's two packs are stored in a `lesson_research` row as soon as they return, before any Lesson is written. With 3–6 Lessons, a slow Parallel Pro call (4 min 32 s in one run) now costs that time once per Course instead of once per Reading.

The storage this ADR deferred is settled in ADR 0009: one `lesson_research` row per Course Request and slot. The packs are written unchanged, and the writer reads them from that row. A slot's research is stored independently of the others, so a failed or cancelled run keeps every slot that finished, and Resume researches only the slots still missing. The rows are keyed by slot, not by run, so research for one slot can also be read on its own when Lessons are later written one segment at a time (SEN-79).
