---
date: 2026-11-01
tickets: SEN-110
people: Yarden
status: active
---

# Sign-up sends one email that welcomes the new Learner, and its button verifies the address and signs them in

There is no separate welcome email after verification. The confirmation email is the welcome email: written and designed as a welcome, with one button.

**What we turned down:** two emails, verification first and then a welcome. A second email needs a sender of our own outside Supabase Auth, because Supabase only sends emails for auth events, and it doubles what a new person has to read before they start.

**What it costs:** the welcome can only say what fits next to a verify button. Anything longer, like onboarding tips, has to live in the app.
