---
date: 2026-10-31
tickets:
people: Ben
status: active
---

# Knibbler Setup ticks live in a committed file in the repo, not the shared database, and reach the other founder by git pull

The first version stored ticks in `setup_checklist_progress` in the shared database, so a tick showed on the other founder's console after a refresh. In practice nobody could tick: writing needed `CONSOLE_OPERATOR` set in `.env`, and with it unset every checkbox was disabled. Ben said the checklist does not need to update live. It only needs to be programmatic, so that a pull brings it up to date.

Ticks are now written to `docs/setup-checklist-progress.json`, one item per line, and signed with the checkout's `git config user.name`. That name is already set on every machine that commits, so `CONSOLE_OPERATOR` is gone. The empty table is dropped in migration 0029, so progress has a single home.

What it costs: a tick is not shared until it is committed and pushed, and the other founder only sees it after a pull. Two founders who tick at the same time can hit a merge conflict in the file. Writing one item per line, in checklist order, keeps that to the rare case where both touch neighbouring items.
