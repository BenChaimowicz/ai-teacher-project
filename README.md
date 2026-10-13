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

Typechecks database, API, worker, web, and browser tests, then runs the logic checks (Progress, Quiz scoring, Sequence mode), the API checks (Course Request creation, Profile gating, validity policy and lifecycle, provider failures, revision history, Study, Quiz play), and model-output validation and Judge independence checks. These deterministic tests do not access Supabase or model providers.

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

Course Requests can be saved with a subject and Learning Goal, then reopened from Home or Open items. **Check request** runs validity before Assessment, without research search. The outcome passes, asks one targeted clarification, or rejects with a reason and safe reframe. **Revise request** creates an editable new draft; the rejected original stays in history. Provider errors leave the Request unchanged.

Once the Starting Level is confirmed, **Design my Course Blueprint** designs one Reading followed by one Quiz for the remaining gap, runs the Code checks and an independent Judge, and shows the Learner titles and Lesson goals with a Sequence mode choice. Closing and returning keeps the review. **Approve** stores the approved snapshot and moves the Request to generating; Lesson generation is follow-on work (SEN-43 onward).

To design one real Blueprint against OpenRouter and the configured Supabase database (after `pnpm db:migrate`):

```bash
pnpm check:blueprint:live
```

This opt-in check makes billable author and Judge calls, prints the Blueprint, and rolls back every temporary record.

To exercise real validity decisions against OpenRouter and the configured Supabase database:

```bash
pnpm check:validity:live
```

This opt-in check makes billable model calls for corpus study, named-song skills, descriptive versus operational harm, protected copies, and an unsupported premise with clarification. Temporary Learners and Requests are rolled back, including on failure; existing data is untouched.

Generator and Judge share one native-fetch OpenRouter transport. Defaults live in `apps/api/src/lib/model-config.ts`; optional server-only overrides are listed in `.env.example`. Judge calls require a different author model ID. Research vendors remain direct; validity makes no research calls. Validity does not automatically retry or switch models. Provider schemas are also checked in application code, including stage-specific clarification invariants.

Deploy notes: [`docs/deploy.md`](docs/deploy.md).
