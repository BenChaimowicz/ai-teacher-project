# Partial Starting Level diagnostic answers live only in the browser

The Starting Level diagnostic shows one Diagnostic item per screen. Each answer is saved to `localStorage`, keyed by the diagnostic attempt, and the server receives all eight answers together only when the Learner finishes. The check is eight questions long, the prototype has one Learner and no auth, and a submit-once write means no half-scored rows and no per-answer endpoint.

Consequences: the server never holds a partial diagnostic. SEN-57's mid-diagnostic abandon path restores answers from the browser. Switching device or clearing storage restarts the eight items. A retried diagnostic is a new attempt with a new key, so it never shows old answers. Spec §4.3's "persist partial responses" is met in the browser, not in Postgres.

Rejected: also writing each answer to the server, which gives cross-device resume but adds an endpoint and partial-row states for an eight-question check.
