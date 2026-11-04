---
date: 2026-11-03
tickets: SEN-106
people: Ben
status: active
---

# The app is hosted on Railway, starting on the Hobby plan, with the SPA inside Fastify and Supabase kept

**Why:** SEN-106 reopened hosting from scratch, since nothing is deployed yet and ADR 0001 had only inherited Railway from the spec. We compared fifteen options on 2026-11-03 against what the app needs: two always-on Node processes (the Fastify API, which also serves the SPA and `/media`, and the worker that polls leased jobs, ADR 0012), a clean SIGTERM, Starting Level check requests that sit silent for minutes (p95 301 s, slowest 314 s over the last 21 days), previews that include the worker, and little to operate for two people.

Railway is the cheapest managed host that runs the app as it is: about $10–15 a month on Hobby for two small Node processes, per-PR environments that get their own environment id (so `jobOwner()` keeps a preview's worker off other stacks' jobs with no setup, ADR 0024), and a pnpm-monorepo build. Hobby keeps logs for 7 days instead of Pro's 30 and its deploys may be queued when Railway is busy. Neither matters before launch.

We turned down:
- **Render in Frankfurt.** It was the recommendation: same city as Supabase, a request timeout that fits the Starting Level check, and 30 s of SIGTERM grace. It costs $39–57 a month, and we have no Learners whose latency it would serve yet.
- **Northflank.** Frankfurt, cheap and full previews, but its pricing page shows a security incident notice asking users to rotate credentials.
- **A Hetzner server with Coolify.** About €6 a month, but one of us would own the server.
- **Platforms that cut long requests off or change the app's shape.** Azure Container Apps (240 s, fixed), DigitalOcean App Platform (100 s), Fly.io (about 60 s idle), AWS App Runner (closed to new customers on 2026-04-30), ECS Fargate (about $59 a month plus the network setup), Heroku, Koyeb (joining Mistral), Vercel (its worker product, Daemons, is beta and skips previews), Cloudflare Workers and Supabase Edge Functions (both would mean rewriting the API).

The SPA stays inside Fastify, because the session cookies need the web app and the API on the same site (decision 2026-11-01). Supabase stays for the database, auth and storage. Production will get its own Supabase project when we prepare the release, and hosting is reviewed then too.

**What it costs:** Railway has no Frankfurt region. The services run in EU West (Amsterdam), a few milliseconds from Supabase in eu-central-1, on every query. Railway closes a request that sends nothing for 5 minutes, and about one Starting Level check in twenty runs longer than that today, so lowering that time (SEN-125) is now a launch requirement. Railway also gives a redeployed process 0 seconds between SIGTERM and SIGKILL by default, so the worker must set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` to hand its job back.
