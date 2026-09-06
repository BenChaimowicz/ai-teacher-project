# Deploy (Railway)

The prototype runs as **two Node processes** against the **same hosted Supabase** project (Postgres + one private Storage bucket). A public URL is not required for local work.

## Target

- **Railway**, one project, two services: **web** and **worker**.
- Both services use the same env keys as `.env.example`.
- **Vercel is not the named target.**

The web service is the Fastify API. It serves the built Vite SPA, JSON under `/api/…`, and `/media/…`. The worker is a separate Node process. The browser never talks to the worker.

## Local

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm run apps
```

`pnpm run apps` starts the Vite frontend, the Fastify API, and the idle worker together. Vite proxies `/api` and `/media` to the API. In production those paths are served by Fastify directly — still two processes, not three hosts.

## Railway (later)

This prototype does not have to be pushed. When it is:

1. Create one Railway project with two services from this repo.
2. **web:** build `pnpm --filter @senoy/web build && pnpm --filter @senoy/api build`, start `pnpm --filter @senoy/api start`. Root directory is the repo root so Fastify can find `apps/web/dist`.
3. **worker:** start `pnpm --filter @senoy/worker start` (build `pnpm --filter @senoy/worker build` first if you compile).
4. Copy the same env into both services. Do not add a third frontend service; do not point this app at Vercel.
