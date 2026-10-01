# AI learning course platform

Prototype from [`docs/spec.md`](docs/spec.md). Domain language lives in [`CONTEXT.md`](CONTEXT.md). Throwaway probes in `prototype/` are not this app.

## Run locally

Needs Node 22+, [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`), and a filled `.env` (copy `.env.example`; never commit secrets). Drizzle talks to hosted Supabase — there is no local database.

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm run apps
```

Then open `http://127.0.0.1:5173`. That one command starts the Vite Workspace, the Fastify API, and the idle worker.

## Check

```bash
pnpm check
```

Typechecks database, API, worker, and web, then runs the API checks (including Course Request creation, validation, Profile gating, and history) and the Progress/completion check. These tests do not access Supabase.

To verify Course Request persistence against the configured Supabase database:

```bash
pnpm check:course-requests:live
```

This opt-in check creates temporary Learners inside a transaction and rolls back all writes. It does not change the seeded Learner or existing Courses.

Course Requests can be saved with a subject and Learning Goal, then reopened from Home or Open items. They remain **Awaiting validity review**; validity, Assessment, and generation are follow-on work.

Deploy notes: [`docs/deploy.md`](docs/deploy.md).
