# Decision log

Every mid-sized or bigger decision the team makes in a chat about a ticket gets one file here: **what we decided, why, and when**. It is the team's record of how we got to the code we have — not a design doc, and not a replacement for [`docs/adr/`](../adr): an ADR argues one architectural choice at length; a decision-log entry is the short minute of a call we made.

The log is plain Markdown in the repo, with no database. The Usage Console reads this folder straight off disk and shows it at **Decisions** (`pnpm dash` → http://127.0.0.1:5174/decisions), so editing a file here changes the screen on the next refresh.

## When to log

Log it when the decision would make a teammate ask "why is it like that?" later:

- A scope call on a ticket — what we are building, what we are deliberately not.
- Picking one approach over another we seriously considered.
- Changing something we already decided (then set `status` on the old entry).
- A number or threshold we chose on purpose (a retry cap, a cadence, a price ceiling).
- A deliberate trade-off: cost, latency, quality, or risk we accepted.

Do not log: the obvious one-way choice, naming a variable, a bug fix with no choice in it, or anything already spelled out in `CONTEXT.md`, the spec, or an ADR. The log is worth reading only if everything in it mattered.

## Writing an entry

One file per decision, named `YYYY-MM-DD-short-slug.md` — the date we decided:

```markdown
---
date: 2026-10-27
tickets: SEN-105, SEN-85
people: Yarden, Ben
status: active
---

# The decision, as one sentence in the present tense

**Why:** What made us decide it — the problem, the alternative we turned down, and what it costs us.
```

Front matter:

| Key | Required | What it holds |
|---|---|---|
| `date` | yes | `YYYY-MM-DD`, the day we decided. |
| `tickets` | no | Linear ids, comma-separated. Empty when the decision spans the project. |
| `people` | no | Who was in the room, comma-separated. |
| `status` | no | `active` (default), `superseded`, or `reversed`. |
| `supersedes` | no | Ids of entries this replaces (an id is the file name without `.md`), comma-separated. |

The `#` heading is the decision itself; everything after it is the why. Write prose, not bullets of one word — the console renders paragraphs, bullet lists, and `**bold**` leads.

When a decision is replaced, do not edit history: write the new entry with `supersedes:`, and set the old entry's `status:` to `superseded` (or `reversed` when we simply undid it).
