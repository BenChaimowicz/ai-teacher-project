---
date: 2026-10-31
tickets: SEN-110
people: Yarden
status: active
---

# Learner accounts use Supabase Auth, not an auth system we build ourselves

The database already runs on Supabase, so its Auth service is already part of what we run. It handles password hashing, sessions, Google sign-in, email codes, magic links and rate limits on the auth endpoints. Building those ourselves would mean hand-writing and maintaining the most security-sensitive code in the app.

**What we turned down:** our own auth on Fastify (Lucia-style: argon2id, a sessions table, our own reset tokens), plus Clerk and Auth.js. Doing it ourselves gives full control and no vendor tie, but every part of it would be ours to get right. Clerk would add a second vendor next to the one we already have.

**What it costs:** identity lives in Supabase's `auth` schema, which we don't own. Moving off Supabase later means migrating users and password hashes. Email templates, providers and limits are configured in the Supabase dashboard instead of in code.
