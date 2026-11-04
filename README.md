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

A Blueprint plans what each Reading shows (SEN-121): at most two visuals per Reading, each a kind (`depiction`, `diagram`, or `technique`) and an intent, with one as the norm. The Reading's writer turns each into a Visual brief: the section it follows, its subject, a `mustShow` checklist of the facts that must be visibly right, the caption and alt text the Learner reads, and the Media category and Topic tags it is filed under. A depiction or diagram is drawn first (see Illustrations); then the library's best two files by category and tags are sent to the Vision Judge against the brief; then Wikimedia Commons; then the Lesson goes without it, which never fails a Lesson. A technique is never drawn: library, then Commons, judged harshly on `TECHNIQUE_JUDGE_MODEL`. The searches start as soon as the briefs are written, while the prose is judged and repaired, and a Chapter's Lessons get theirs at once. On a pass the Lesson body gains a media block holding a copy of the descriptor. Study shows the file at `/media/<storage key>`, which the API streams from the bucket only when a published Lesson's body holds that key; an SVG is judged as a PNG and served as the SVG.

When the library has no file for a visual, `findVisualOnCommons` (`apps/api/src/lib/commons-ingest.ts`, SEN-129) searches Wikimedia Commons for it. It keeps only still images under public domain, CC0, CC BY or CC BY-SA, never non-commercial, no-derivatives, GFDL-only or unknown. The injected Vision Judge checks up to three of them against the brief. The first that passes is copied into the bucket under `library/commons/` and added to `media_descriptors` as **unreviewed**, so the next lookup for the same category and tags finds it. Commons needs `WIKIMEDIA_CONTACT` in `.env` for its User-Agent; without it, Reading generation leaves Commons out and the library is the last source. Every Commons call and Judge call is a Usage Record under a `media_search` Pipeline Event. **Media review** in the Usage Console lists unreviewed files with thumbnail, caption, licence, author and source page. Approve keeps a file. Remove stops new Readings from using it, and Lessons that already show it keep it.

## Illustrations

A Reading's depiction or diagram is drawn by `packages/illustration` (SEN-128) in one papercraft house style (decision 2026-11-03). The illustrator (`apps/api/src/lib/illustrator.ts`, SEN-121; `ILLUSTRATOR_MODEL` and its fallback, the writer pair by default) answers a `VisualBrief` with a **scene plan**: a closed set of cut-paper blocks (shapes, tapered limbs, foliage, a tree, standing figures, a few creatures and lab objects, cells, numbered discs, arrows, text, panels, Jongi) placed on a fixed 1200 x 800 sheet, plus labels the engine places itself so they never overlap. `SCENE_PLAN_SCHEMA` is the strict structured-output schema the model answers in, `scenePlanFailures` lists every problem with a reply in plain language, and `renderScenePlan` draws a valid plan as SVG and PNG; the same plan always gives the same bytes. Colours are palette names from `apps/web/src/index.css`, never hex. The Vision Judge (`visual-judge.ts`) checks the PNG against the brief's `mustShow`; a fail gets one more plan with the reasons, and two fails fall through to the library. A passing PNG is filed under `generated/<sha256>.png` in the media bucket as a product-owned, origin `generated` descriptor. Each brief is one `illustration` Pipeline Event holding its plan and Judge calls. Jongi renders as a marked placeholder until the poses are exported from `jongi.blend`, so the illustrator is not offered that block yet. The illustrator is shown the two committed fixture plans (`packages/illustration/fixtures`, a depiction and a diagram) as worked examples of quality and composition, read from the files so the prompt and the committed renders never drift. A plan places everything on the raised card the renderer draws (x 44..1156, y 40..760), and the engine refuses a limb drawn after a crown with a knot inside it, so branches go before the leaves that cover them.

```bash
pnpm --filter @senoy/illustration fixtures
```

draws the committed fixture plans in `packages/illustration/fixtures/` (Yggdrasil and the Gram stain steps) to PNGs beside them and prints how long each render took.

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

To exercise the subject check (spec §4.2) on the real triage model and the configured Supabase database:

```bash
pnpm check:subject-check:live
```

This opt-in check makes billable triage calls for "Mercury" and "Java" (several readings), "Norse mythology" and "Java for Android apps" (one reading), then picks a reading. Temporary Learners and Requests are rolled back, including on failure.

To exercise Lesson reuse (spec §5.8) on a real published Reading, against OpenRouter and the configured Supabase database:

```bash
pnpm check:reuse:live [subject]
```

This opt-in check makes billable model calls: the fit call on a slot asking for what the subject's oldest reusable Reading teaches, and on one asking for something unrelated, then the verbatim-or-adapt pass and the reading checks on that Reading. It writes nothing beyond its Usage Records. The subject defaults to "Norse mythology".

To exercise one Reading's Demonstrative media (spec §5.6) against OpenRouter, the seeded Media catalog, and the private bucket:

```bash
pnpm check:reading-media:live
```

This opt-in check makes billable model calls, about $0.50: it writes the SEN-36 Norse Reading whose slot plans a depiction of Yggdrasil, has the illustrator draw it and the Vision Judge check it, falling back to the seed catalog's Frølich plate and to Commons, and stores a passing drawing in the bucket. It writes the run to `docs/research/sen-121-norse-reading-media-run.json` and fails unless the planned visual was shown.

`pnpm check:reading-media:live drum-stroke` writes a drum Reading whose slot plans two visuals (SEN-121): a matched-grip technique, which is never drawn and comes from the seed catalog's photographs judged harshly, and a full-stroke diagram, drawn first with the rebound-stroke strip as the library fallback. It reads its Source packs from `docs/research/sen-115-drum-stroke-source-packs.json`, and researches and saves them first (about $0.15) when that file is missing. It writes the run to `docs/research/sen-121-drum-stroke-reading-media-run.json` and fails unless both visuals were shown.

To see which visuals the test Courses' Blueprints plan (spec §7):

```bash
pnpm check:test-course-blueprints:live [norse|drums|microbiology]
```

This opt-in check makes billable model calls, about $0.03 a Course: it designs a live Blueprint for the Norse, drum kit, and microbiology Courses for a brand-new Learner and prints each Reading's planned visuals by kind and intent. It writes the run to `docs/research/sen-121-test-course-blueprints.json` and fails unless each Blueprint passes its Judge and at least half its Readings plan a visual. A gap shows up as a Reading that plans no visual, so read the output against spec §7.

To pick the technique Judge (spec §5.6) from a set of right and deliberately wrong drum-grip images:

```bash
pnpm check:technique-judge:live [model,model,…] [output path]
```

This opt-in check makes billable vision calls, a few cents in all: it judges every pair in `docs/research/sen-121-technique-judge-set.json` (seed catalog files and one Commons file, fetched live, so `WIKIMEDIA_CONTACT` is needed) on each candidate model, `openai/gpt-6-luna` and `openai/gpt-5.6-luna` by default and never Sol or Terra, writes the verdicts to `docs/research/sen-121-technique-judge-eval.json`, and names the model to pin as `TECHNIQUE_JUDGE_MODEL`: no wrong image let through, then the fewest right ones refused. It fails when no candidate rejects every wrong grip.

Two comparisons from the cost work (SEN-120) can be re-run when a vendor or a price changes:

```bash
pnpm check:fact-check-vendors:live [claims path] [output path] [snippets,highlights,lite,standard]
pnpm check:research-processors:live [output path]
```

The first runs the real Starting Level fact-check over the keyed answers in `docs/research/sen-120-fact-check-claims.json` with each candidate search (You.com Web Search with snippets or highlights, Research lite, Research standard), the same Judge reading each one's excerpts, two claims at a time, and writes every verdict to `docs/research/sen-120-fact-check-vendors-run.json`; all four variants cost about $1. The second researches the two test Courses' Reading topics on Parallel's `core` and `pro` processors at once and writes both packs per topic, about $0.25.

To re-run the Norse and Gram test Courses through the product and see what each stage cost:

```bash
pnpm run:test-courses:live [norse|gram|all] [output path] [--resume <request id>]
```

This is a billable run, about $1.30 a Course, not a check: with `pnpm apps` running against the shared database, it signs in as `TEST_LEARNER_EMAIL` / `TEST_LEARNER_PASSWORD` (a confirmed account; a missing Teaching Profile is saved with default answers), drives each Course from Request to published the way the 2026-11-01 runs were done by hand (validity, focus, Starting Level answered "I don't know" throughout, Blueprint, approve, generation), then prints the per-stage spend from `usage_records` and writes the run to `docs/research/sen-120-test-course-runs-<date>.json`. Every step acts on the Request's current status, so `--resume <request id>` with one Course name continues a Request wherever it stands instead of starting another. The Courses land in that Learner's Library.

Generator and Judge share one native-fetch OpenRouter transport. Defaults live in `apps/api/src/lib/model-config.ts`; optional server-only overrides are listed in `.env.example`. Judge calls require a different author model ID. Research vendors remain direct; validity makes no research calls. A reply that is invalid or cut off is retried once on the same model, then once on the configured fallback, and each reply names the model that wrote it so the Judge never judges its own author's work (ADR 0015). A call OpenRouter rate-limits is retried once on the same model after the wait its reply asks for, capped at thirty seconds; other HTTP errors are not retried. Provider schemas are also checked in application code, including stage-specific clarification invariants.

Deploy notes: [`docs/deploy.md`](docs/deploy.md).
