---
date: 2026-10-28
tickets:
people: Yarden
status: active
---

# Mid-sized and bigger team decisions are logged as Markdown files in the repo, read live by the Usage Console

Decisions about tickets were being made in chats with the agent and then living only in those chats. The code that came out of them is in git, but the reasoning is not: a month later nobody can say whether a cap, a cadence or a dropped feature was a considered call or an accident, and the same argument gets had twice.

**Why:** The log is a folder of Markdown files, one per decision, because that is the only store the team already has in every worktree — it reviews in the PR that caused it, merges with the code, and needs no migration, no table and no backup. A database row would be a second source of truth for something git already versions, and a Linear comment would be scattered across tickets with no way to read the project's decisions in order.

The Usage Console reads `docs/decisions/` off disk on each request rather than importing it at build time, so an entry written mid-session shows on the next refresh. It is the right screen for it: the console is the Operator's view of how the platform behaves, and the decision log is why it behaves that way.

`docs/adr/` stays what it is. An ADR argues one architectural choice in full, with its rejected alternatives; most ticket decisions do not deserve that and so never got written down at all. An entry here is three fields — decision, why, when — which is cheap enough to actually write.

Rejected:
- **A single `DECISIONS.md` file.** Several agents work in parallel worktrees on the same repo, and every one of them appending to the same file means a merge conflict on every branch.
- **Generating the log from git history or Linear.** Commits say what changed, not what was considered and dropped; the why is exactly the part no tool can recover later.
