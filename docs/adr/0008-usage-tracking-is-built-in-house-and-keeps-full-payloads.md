# Usage tracking is built in-house and keeps full payloads

The Usage Console and the records behind it (Usage Records, Pipeline Events, Product Events, API Requests) are built in this repo and stored in the platform's own Postgres, rather than adopting a hosted LLM-observability or analytics tool (Langfuse, Helicone, PostHog, OpenRouter's own activity page). The questions Operators care about join tracking data to platform records ("what did this Course Request cost, and which rewrite round burned it?"), and owning the tables makes those joins plain SQL instead of a cross-system export.

Usage Records keep the full prompt and response text with no retention limit for now. The prototype has one Learner and two Operators, so storage and privacy pressure are low, and "why did the Generator produce this?" is the most valuable debugging question. A retention policy is expected once real Learners or real volume arrive; until then, nothing is deleted.
