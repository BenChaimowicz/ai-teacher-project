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

Typechecks database, API, worker, web, and browser tests, then runs the logic checks (Progress, Quiz scoring, Sequence mode) and the API checks (Course Requests, Study, Quiz play). These tests do not access Supabase.

Browser tests (Playwright) are separate and need Docker running:

```bash
pnpm --filter @senoy/e2e exec playwright install chromium   # once
pnpm test:e2e
```

They start a throwaway Postgres container, migrate it, reset the fixture Course before each test, and remove the container afterwards. Your `.env` database is never touched.

To verify Course Request persistence against the configured Supabase database:

```bash
pnpm check:course-requests:live
```

This opt-in check creates temporary Learners inside a transaction and rolls back all writes. It does not change the seeded Learner or existing Courses.

Course Requests can be saved with a subject and Learning Goal, then reopened from Home or Open items. They remain **Awaiting validity review**; validity, Assessment, and generation are follow-on work.

Deploy notes: [`docs/deploy.md`](docs/deploy.md).
