# Generation prompts stay subject-neutral

System prompts for Generators and Judges are fixed text that names no subject. Examples in them use a neutral, everyday domain ("{opt3} is the boiling point, not the freezing point"), never the Course we happen to be testing on. Everything specific to a Course reaches the model through the user JSON: the slot, its objectives, and the Lessons. No call writes prompt text for a Course.

The Quiz author prompt had picked up Norse examples while we tuned it on the SEN-43 Norse Reading (SEN-44, 2026-10-18): "{opt3} is the realm of the Vanir, not the Æsir", "what the myth supposedly lacks", and a proposed "the realms of gods, humans, and the dead". Examples steer a model, so a cooking or statistics Quiz would lean towards Norse-shaped questions. We rewrote them as general rules ("When an objective lists several things, the items for it together test every one of them").

When a live run fails on one Course, fix the prompt with a rule that holds for any subject, and keep the failing case in a test or a run record, not in the prompt. If a rule needs Course knowledge to apply, such as which parts an objective lists, make the model state it in structured output and check it in code.

Rejected:
- **Generate a Course-specific part of the prompt per Course.** The author already sees the Course in its input; generated prompt text would be unchecked model output steering another model, inherited quietly by every Lesson of that Course, and it makes failures harder to compare across runs.
- **Keep the examples from whatever Course a fix was tuned on.** Each tuning pass would add another subject's bias.

The Diagnostic validity prompt's "Norse mythology" and "How to feed unicorns" examples are deliberate: they illustrate the learnability rule itself across framings, not a Course being generated.
