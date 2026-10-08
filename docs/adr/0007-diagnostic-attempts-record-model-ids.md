# Diagnostic attempts record which models and vendor produced them

Each Starting Level diagnostic attempt row stores the author model ID, the Judge model ID, and the fact-check vendor (when one ran). This deliberately departs from the general rule that model IDs live in config and not on records (`docs/research/publish-gate-judge-models.md`). That rule exists so a Judge SKU bump is a config change. It is about what selects a model, not about provenance. A diagnostic attempt is an audit artifact: when a keyed answer later turns out wrong, we need to know who wrote it and who passed it, and config will have moved on by then.

The rule still applies to selection: which models run is still read from config. Lessons and other records do not gain model IDs because of this ADR.
