---
date: 2026-11-01
tickets: SEN-114, SEN-110
people: Yarden
status: active
---

# App email sends through Resend from auth.knibbler.app, apart from founder email on Zoho

Supabase Auth's emails (signup confirmation, magic link, password reset, email change) go out through Resend's SMTP, in the EU region, as `Knibbler <no-reply@auth.knibbler.app>`. The sending domain is the `auth` subdomain. Resend's DNS records sit on `send.auth` and `resend._domainkey.auth`, so the Zoho MX records and the single root SPF record stay untouched. Click and open tracking are off, so sign-in links reach the Learner unchanged.

**What we turned down:** sending app email from Zoho Mail or a founder's inbox. That would mix automated sending with human mail and put the founders' deliverability at risk. We also turned down Supabase's built-in mailer, which is limited to a few messages an hour (see the branded-email decision of 2026-10-31). Postmark was the other provider on the checklist.

**What it costs:** one more vendor to administer and pay for once we go past its free tier. With custom SMTP, Supabase starts at about 30 auth emails an hour, so that limit needs raising before launch. The Supabase SMTP password is a send-only Resend key, so rotating the key means updating Supabase.
