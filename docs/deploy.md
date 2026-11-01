# Deploy (Railway)

The prototype runs as **two Node processes** against the **same hosted Supabase** project (Postgres + one private Storage bucket). A public URL is not required for local work.

## Target

- **Railway**, one project, two services: **web** and **worker**.
- Both services use the same env keys as `.env.example`.
- **Vercel is not the named target.**

The web service is the Fastify API. It serves the built Vite SPA, JSON under `/api/…`, and `/media/…`. The worker is a separate Node process. The browser never talks to the worker.

Neither service assumes it is the only one of its kind. Workers claim generation jobs with `for update skip locked` (ADR 0012), and an API preparing a Starting Level check leases its Course Request, so a second API leaves a check in flight alone (ADR 0023). Two people running `pnpm apps` against the same hosted database is the everyday case of this.

## Domain, DNS and email

Where each piece of `knibbler.app` is configured. Logins and recovery codes are in the shared password vault, never here.

| What | Where | Notes |
|---|---|---|
| Domain `knibbler.app` | **Porkbun** | Both founders have access. WHOIS privacy, auto-renew and domain lock are on. |
| DNS | **Porkbun**, the only nameservers | Every record below lives here. Do not move nameservers. |
| Founder email (`yarden@`, `ben@`) | **Zoho Mail**, Forever Free, US region | MX `mx.zoho.com` / `mx2` / `mx3`, root SPF `v=spf1 include:zohomail.com ~all`, DKIM selector `zmail`. |
| Role addresses (`accounts@`, `founders@`, `support@`, `privacy@`, `security@`) | **Zoho Mail Groups** | Each delivers to both founders and accepts mail from outside. Vendor sign-ups use `accounts@`. |
| DMARC | Porkbun, `_dmarc` | `p=none` (monitoring), reports to `accounts@`. It covers subdomains too. |
| App email (Supabase Auth) | **Resend**, EU region, on `auth.knibbler.app` | Sender `Knibbler <no-reply@auth.knibbler.app>`. DNS on `send.auth` (CNAME) and `resend._domainkey.auth`. Click and open tracking are off. |
| Supabase Auth SMTP | Supabase project `lhtzbqrovumcjwrlektf` → Authentication → SMTP | `smtp.resend.com:465`, user `resend`, password = a send-only Resend key. Every other Auth setting (password rule, email codes, Site URL, redirect URLs) and the email templates live in `auth/` and are sent with `pnpm auth:push` (decision 2026-11-01). Never edit them in the dashboard. |
| App and API hostnames | Not set yet | Waits for the hosting choice (SEN-106). |

Founder email and app email never share a sender: app mail goes through Resend from the `auth` subdomain, and human mail goes through Zoho from the root domain. Keep one SPF record on the root domain.

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
