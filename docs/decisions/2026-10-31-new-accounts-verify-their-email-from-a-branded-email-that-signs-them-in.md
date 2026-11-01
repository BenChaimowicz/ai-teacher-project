---
date: 2026-10-31
tickets: SEN-110
people: Yarden
status: active
---

# A new account must verify its email, from our own branded welcome email, and the verification link signs you in

We send our own designed email welcoming the new Learner. Its link verifies the address and signs them in, so no second step is needed. Sending needs a real email sender: Supabase's built-in mailer is limited to a few messages an hour and is only meant for testing.

**What we turned down:** letting people use the app before verifying, and Supabase's plain default emails.

**What it costs:** an email provider and a sending domain to set up and pay for. Sign-up now waits for the person to open their email before they can start.
