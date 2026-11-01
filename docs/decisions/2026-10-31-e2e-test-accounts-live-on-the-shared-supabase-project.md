---
date: 2026-10-31
tickets: SEN-110
people: Yarden
status: active
---

# E2E test accounts are created on the shared Supabase project and deleted after each run, while e2e data stays in its throwaway local Postgres

We can't have a separate Supabase project right now. Sign-in in the web app goes straight to Supabase Auth, so e2e needs real accounts there. The run creates already-confirmed users through the admin API, with an address it recognises (`e2e-<run>-<n>@…`). It deletes them when it finishes, and any it finds left over from a crashed run. Courses, Progress and other app data stay in the local Postgres that `e2e/run.ts` throws away. The fixture's `truncate` never runs against shared data.

**What we turned down:** a second Supabase project just for testing, which we can't have yet, and swapping in a fake auth for e2e, which would leave the real sign-in screens untested.

**What it costs:** e2e needs the service-role key and network access to Supabase. A crashed run can leave test users in the shared project until the next run cleans them up. Because e2e's local Postgres has no `auth` schema, `learners.id` matches the Supabase user id by convention, with no foreign key to `auth.users`.
