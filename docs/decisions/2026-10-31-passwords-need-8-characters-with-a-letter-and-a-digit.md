---
date: 2026-10-31
tickets: SEN-110
people: Yarden
status: active
---

# Passwords need at least 8 characters, including a letter and a digit

Supabase Auth enforces this rule at sign-up and on password change, and the web app shows the same rule before submitting. Supabase stores only the password hash.

**What we turned down:** Supabase's leaked-password check against HaveIBeenPwned, which needs the Pro plan, and stricter rules requiring symbols or mixed case. Those annoy people more than they protect them.

**What it costs:** a password that meets the rule but has already leaked is still accepted.
