---
date: 2026-11-01
tickets: SEN-110, SEN-114
people: Yarden
status: active
---

# Auth emails go out through Supabase Auth's SMTP to Resend, with templates we design in the repo and push to Supabase by script

Supabase Auth sends the sign-up (welcome and verify), sign-in code and password reset emails through the Resend SMTP connection already set up in SEN-114. We write each template's subject and HTML in the repo, in the Knibbler style. A script pushes them to the project through Supabase's Management API, so the repo stays the only copy and nobody edits them in the dashboard.

**What we turned down:** Supabase's Send Email Hook, which calls an endpoint in our API that sends through Resend's API. It would give full control, including emails beyond auth events, but it adds an endpoint to secure. If the API is down, nobody can sign in, and it can't work before the API is hosted (SEN-106).

**What it costs:** Supabase only sends emails for auth events, so emails like "your Course is ready" need their own sender later. Templates use Supabase's Go template syntax, not components, and pushing them needs a Supabase personal access token.
