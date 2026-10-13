# Lesson checkpoints are a separate table that holds their Source packs

A finalized, unpublished Lesson is one `unpublished_lessons` row per Course Request and Blueprint slot. The row holds the shared Lesson envelope, the method body, the numbered Citations Study will show, the source list (each entry keeps its Source ID), the Judge verdict, both Source packs exactly as research returned them, and the Sources that Source vetting dropped, with reasons. This settles the storage ADR 0005 deferred: the packs are the retrieval set the Code checks and the Judge ran against, so they are kept with the Lesson they grounded and are not reshaped into tables of their own.

A checkpoint is not playable or reusable because Study and Lesson reuse read only the published tables. Atomic publication will copy checkpoints into `published_lessons`, whose `citations` column already takes the `{ n, title, url }` list. Model IDs are not stored on checkpoints (spec §5.4). ADR 0007's provenance exception covers diagnostic attempts only.

Until page extraction exists, a Source's `publisher` is its host, and every Source is used as a paraphrase. Vendor excerpts are not verified page text, so nothing is stored as a quote.

Rejected:
- **A draft flag on `published_lessons`.** Every Study and reuse query would need the filter, and one missed filter makes an unpublished Lesson playable.
- **Separate Source and Citation tables.** No query reads them across Lessons yet, and published Lessons already keep both as jsonb.
- **Storing only the cited Sources.** The §6.3 Code check is "every Citation URL is in this Lesson's retrieval set", and the repair work in SEN-57 will regenerate from the same packs.
