---
date: 2026-10-31
tickets: SEN-110, SEN-76
people: Yarden
status: active
---

# SEN-110 builds accounts for Learners only, signing in with email and password, Google, or a 6-digit code sent by email

Sign-up offers email and password, or Google. Sign-in offers the same two, plus a 6-digit code emailed to you, which many apps now use instead of a password. Operators, and the Usage Console gate in SEN-76, are not part of this ticket.

**What we turned down:** one identity system with Learner and Operator roles, built now. The Console is a separate app with its own question still open (SEN-76), and folding it in would grow this ticket before Learners can sign in at all.

**What it costs:** SEN-76 has to decide later whether to reuse these accounts with a role or keep its own gate. Three sign-in methods mean three flows to build and test, plus a Google OAuth client to set up and maintain.
