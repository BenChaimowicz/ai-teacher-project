# AI learning course platform

Prototype from [`docs/spec.md`](docs/spec.md). Domain language lives in [`CONTEXT.md`](CONTEXT.md). Throwaway probes in `prototype/` are not this app.

## Run locally

Needs Node 22+, [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`), and a filled `.env` (copy `.env.example`; never commit secrets). Drizzle talks to hosted Supabase — there is no local database.

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm media:seed
pnpm run apps
```

Then open `http://127.0.0.1:5173` and sign up or sign in. Accounts live in Supabase Auth (ADR 0026); its settings and email templates are in `auth/`, sent with `pnpm auth:push` (prints what differs; `--apply` sends it). That one command starts the Vite Workspace, the Fastify API, the worker that generates Courses, and the Operator-only Usage Console at `http://127.0.0.1:5174` (its own API on `CONSOLE_API_PORT`, default 3100). In a terminal it opens a dashboard: the servers are listed on the left, the selected server's logs on the right. Use ↑/↓ to select, space to start or stop a server, `r` to restart, `a`/`x` to start or stop all, and `q` to quit (which stops everything). `pnpm apps:plain` runs the same servers with interleaved logs instead. To run only the Usage Console:

```bash
pnpm dash
```

The Usage Console has no login. Its API listens on this machine only (`127.0.0.1`), so it is not reachable from elsewhere.

**Knibbler Setup** (`/setup` in the Usage Console) is the founders' shared setup checklist: domain, email, vendor access, and authentication email. Ticks are saved to `docs/setup-checklist-progress.json` in your checkout, signed with your `git config user.name` (without one the checklist is read-only). They are not live: commit and push the file to share your ticks, and pull to see your co-founder's. The items themselves live in `apps/console/src/server/setup-checklist.ts`. It never holds credentials or recovery codes — those go in the shared password manager. Where the domain, DNS and email are configured once setup is done: [`docs/deploy.md` → Domain, DNS and email](docs/deploy.md#domain-dns-and-email).

## Media library

Demonstrative media comes from a seeded catalog (spec §2, §5.6). The files are committed under `packages/media/catalog/`, and `packages/media/src/entries.ts` is the one place that says what each is: kind, caption, alt text, source page and author, licence, Media category, Topic tags. Size, digest, dimensions and MIME type are read from the file, never typed in. Only licences the product can host exist (public domain, CC0, CC BY, CC BY-SA, product-owned); CC BY and CC BY-SA entries carry title, author, source URL and licence URL.

`pnpm media:seed` uploads the bytes to the private bucket (`MEDIA_BUCKET` at `MEDIA_ENDPOINT` / `MEDIA_REGION`, with `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY`) and writes the descriptors to `media_descriptors`. It uploads only files the bucket lacks or holds a different digest for, and rewrites only descriptors that differ, so running it twice changes nothing. To add a file: put it under `packages/media/catalog/`, add its entry, run `pnpm media:seed`. A file with no entry, or an entry that fails the descriptor rules, stops the seed with every problem listed.

A Reading's writer may ask for one image: a Media category and Topic tags from what the library holds, the section it follows, and the caption and alt text the Learner will read. Once the Reading passes its Judge, the best-matching raster file that passes the descriptor rules is sent to a separate vision Judge call against that caption and alt. On a pass the Lesson body gains a media block holding a copy of the descriptor; on a miss or a failure the image is dropped and the Lesson goes on without it. Study shows the file at `/media/<storage key>`, which the API streams from the bucket only when a published Lesson's body holds that key. SVG files are not attached yet (SEN-115).

## Decisions

Every mid-sized or bigger decision the team makes about a ticket is one Markdown file in [`docs/decisions/`](docs/decisions/README.md): what we decided, why, and when. The Usage Console reads that folder off disk and shows it under **Decisions**, so an entry written now appears on the next refresh — there is no database and nothing to migrate. Architectural choices still get a full ADR in [`docs/adr/`](docs/adr).

## Migrations

`pnpm db:generate --name <what_it_does>` writes `<number>_<UTC timestamp>_<name>.sql` (for example `0016_20261024140056_usage_console.sql`) and its journal entry. The number is drizzle's order; the timestamp says when it was made. Drizzle applies only migrations whose journal `when` is later than the last one applied to the shared database, so when another branch's migration was applied first, re-stamp yours (raise its `when` and its file timestamp) before `pnpm db:migrate`.

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

Every `pnpm check:*:live` script records its paid calls in the Usage Console like the app does. The check's own reads and writes use `DATABASE_URL` (normally a local Docker Postgres); its Usage Records go to the shared database in `USAGE_DATABASE_URL`, which every live check requires and which may not be a localhost URL. Each run is one Pipeline Event of kind `live_check`, labelled with the script name, holding the Usage Records of every model and research call it made, with no Course Request or Learner attached (those exist only in the local database). Research costs are stored at list price; they are not measured against the vendor balance.

To verify Course Request persistence against the configured Supabase database:

```bash
pnpm check:course-requests:live
```

This opt-in check creates temporary Learners inside a transaction and rolls back all writes. It does not change the seeded Learner or existing Courses.

Course Requests can be saved with a subject and Learning Goal, then reopened from Home or Open items. **Check request** runs validity before Assessment, without research search. The outcome passes, asks one targeted clarification, or rejects with a reason and safe reframe. **Revise request** creates an editable new draft; the rejected original stays in history. Provider errors leave the Request unchanged.

Once the Starting Level is confirmed, **Design my Course Blueprint** designs a Course of 3–6 Lessons for the remaining gap: Readings, with Quizzes placed by the Teaching Profile's Quiz cadence, each Quiz naming the Readings it assesses. The Code checks and an independent Judge run before the Learner sees titles and Lesson goals with a Sequence mode choice. Closing and returning keeps the review. **Approve** stores the approved snapshot, moves the Request to generating, and queues its generation job.

The worker claims the job from Postgres and generates the Course in four steps:

1. **Reuse.** Published Readings on the same subject that share a Topic tag with a Reading slot are offered to one fit call per slot, which judges them on objectives (spec §5.8). A slot that reuses one gets a copy of that Lesson's Source packs and is not researched. With no candidates, no call is made.
2. **Research.** Every other Reading is researched at once (Parallel Pro and You.com per Reading), and each Reading's Source packs are stored in `lesson_research` as soon as they return.
3. **Writing.** Lessons are written one at a time in Blueprint order. Each Reading is written from its stored packs and carries earlier Readings forward; a reused one is taken verbatim or adapted to its slot, passes the same checks, and is researched and written afresh if it can't be made to fit. Each Quiz is written from the checkpointed Readings it assesses. Every finished Lesson is saved as an unpublished checkpoint, with the write-time Teaching Profile values it was written for.
4. **Publishing.** The whole-Course Code checks and Judge run, then the Course publishes atomically.

The Request screen shows the stage, the current Lesson, and N of M. **Cancel** stops the job and keeps finished research and Lessons. **Resume** continues from the next unfinished Lesson without re-running finished research, as does a restarted worker after a crash.

When generation cannot finish, the Request says why in plain language and offers what can actually help (spec §5.1):

- An interruption — a provider timeout, a crash — is resumed by **Retry** from the next unfinished Lesson.
- A Lesson that failed its checks is written again by **Retry** with a fresh repair budget; the Lessons already written are kept.
- A Reading whose Source packs come back empty is searched again with two broader queries before the Course fails for it. A vendor that timed out or errored is not treated as empty: that is an interruption, and Retry searches again.
- **Revise request** opens an editable new Request with the same subject and goal. The failed Request stays in history with its reason, its unpublished Lessons are discarded, and it can no longer be retried.
- When the finished Lessons individually pass but together miss the Learning Goal, no Retry can help, so the plan goes back: the unpublished Lessons and their research are discarded, the approved plan is un-approved, and a new Blueprint is designed from what the whole-Course Judge said. The Learner comes back to a new plan to review, with the reason it changed.

Published Courses are never touched by any of this: nothing is published until the whole Course passes, and a published Request has no failure path left.

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

To exercise Lesson reuse (spec §5.8) on a real published Reading, against OpenRouter and the configured Supabase database:

```bash
pnpm check:reuse:live [subject]
```

This opt-in check makes billable model calls: the fit call on a slot asking for what the subject's oldest reusable Reading teaches, and on one asking for something unrelated, then the verbatim-or-adapt pass and the reading checks on that Reading. It writes nothing beyond its Usage Records. The subject defaults to "Norse mythology".

To exercise one Reading's Demonstrative media (spec §5.6) against OpenRouter, the seeded Media catalog, and the private bucket:

```bash
pnpm check:reading-media:live
```

This opt-in check makes billable model calls: it writes the SEN-36 Norse Reading with the image library offered, looks up the file it asks for, and sends that file to the vision Judge. It writes the run to `docs/research/sen-55-norse-reading-media-run.json` and fails unless one image was attached.

`pnpm check:reading-media:live drum-stroke` writes a drum Reading whose slot requires two images (SEN-115): a matched-grip photo and the rebound-stroke strip, an SVG the vision Judge sees drawn as a PNG. It reads its Source packs from `docs/research/sen-115-drum-stroke-source-packs.json`, and researches and saves them first (about $0.15) when that file is missing. It writes the run to `docs/research/sen-115-drum-stroke-reading-media-run.json` and fails unless every required image was attached.

To see which images the test Courses' Blueprints require (spec §7.1, §7.2) and which catalog files fill them:

```bash
pnpm check:test-course-blueprints:live [drums|microbiology]
```

This opt-in check makes billable model calls: it designs a live Blueprint for the drum kit and microbiology Courses, for a brand-new Learner, offered the committed seed catalog. It writes the run to `docs/research/sen-115-test-course-blueprints.json` and fails unless each Blueprint passes its Judge and requires at least one image the catalog can fill. A gap shows up as a Reading that should require an image and does not, so read the output against spec §7.

Generator and Judge share one native-fetch OpenRouter transport. Defaults live in `apps/api/src/lib/model-config.ts`; optional server-only overrides are listed in `.env.example`. Judge calls require a different author model ID. Research vendors remain direct; validity makes no research calls. A reply that is invalid or cut off is retried once on the same model, then once on the configured fallback, and each reply names the model that wrote it so the Judge never judges its own author's work (ADR 0015). Provider schemas are also checked in application code, including stage-specific clarification invariants.

Deploy notes: [`docs/deploy.md`](docs/deploy.md).
