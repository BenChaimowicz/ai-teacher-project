# Deploy (Railway)

The prototype runs as **two Node processes** against the **same hosted Supabase** project (Postgres + one private Storage bucket). A public URL is not required for local work.

## Target

- **Railway**, one project, two services: **web** and **worker**.
- Both services use the same env keys as `.env.example`.
- **Vercel is not the named target.**

The web service is the Fastify API. It serves the built Vite SPA, JSON under `/api/…`, and `/media/…`. The worker is a separate Node process. The browser never talks to the worker.

Neither service assumes it is the only one of its kind. Workers claim generation jobs with `for update skip locked` (ADR 0012), and an API preparing a Starting Level check leases its Course Request, so a second API leaves a check in flight alone (ADR 0023). Two people running `pnpm apps` against the same hosted database is the everyday case of this.

## Local

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm run apps
```

`pnpm run apps` starts the Vite frontend, the Fastify API, and the generation worker together. Vite proxies `/api` and `/media` to the API. In production those paths are served by Fastify directly — still two processes, not three hosts.

## Railway (later)

This prototype does not have to be pushed. When it is:

1. Create one Railway project with two services from this repo.
2. **web:** build `pnpm --filter @senoy/web build && pnpm --filter @senoy/api build`, start `pnpm --filter @senoy/api start`. Root directory is the repo root so Fastify can find `apps/web/dist`. A Starting Level check in preparation is held by a lease (60 s; `DIAGNOSTIC_LEASE_MS` overrides it), so a killed API's check offers **Try again** once that lapses.
3. **worker:** start `pnpm --filter @senoy/worker start` (build `pnpm --filter @senoy/worker build` first if you compile). It claims generation jobs from Postgres. Railway's SIGTERM on redeploy hands a job in progress back to the queue; a hard kill is picked up once the lease lapses (60 s; `GENERATION_LEASE_MS` overrides it).
4. Copy the same env into both services. Leave `JOB_OWNER` unset: the worker claims only jobs whose owner matches its own, and on Railway both services default to the environment id, so they match (ADR 0024). If you set it, set the same value in both. Do not add a third frontend service; do not point this app at Vercel.
