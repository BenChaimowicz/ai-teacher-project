---
date: 2026-11-01
tickets: SEN-110, SEN-76
people: Yarden
status: active
supersedes: 2026-10-31-sen-110-covers-learners-with-password-google-and-email-code
---

# SEN-110 ships Learner accounts with email and password, or a 6-digit email code, and Google sign-in waits

Sign-up is email and password. Sign-in is email and password, or a 6-digit code sent by email. Google sign-in is set aside for a later ticket. As before, this is for Learners only, and the Usage Console's Operator gate stays separate (SEN-76).

**What we turned down:** shipping Google now. It needs an OAuth client in Google Cloud, with a consent screen and its own redirect setup, before anyone can sign in with it. None of that is needed for accounts to work.

**What it costs:** people who'd rather not make a password have only the email code. Adding Google later means a new button and enabling the provider, plus linking for anyone who already has an account with the same email. Supabase links a verified email to the same user automatically.
