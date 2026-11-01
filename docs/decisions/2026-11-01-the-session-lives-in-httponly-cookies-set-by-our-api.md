---
date: 2026-11-01
tickets: SEN-110
people: Yarden
status: active
---

# The session lives in httpOnly cookies that our API sets, not in the browser's localStorage

Every sign-in flow now goes through our API: sign-up, sign-in by password or email code, the email links, forgot and reset password, change password and sign-out. The API talks to Supabase Auth and keeps the session in two httpOnly cookies that page scripts cannot read. The web app no longer uses `supabase-js`. The API refreshes an expired session itself. Requests that change data must come from our own origin. The API rate-limits the sign-in routes per IP and per email, because Supabase now sees every request coming from the API's one address.

**What we turned down:** keeping the bearer token in `localStorage` (ADR 0026 as first written), which was Claude's recommendation. It needs less code and keeps Supabase's own per-IP limits working. Yarden chose cookies so that a script injected into the page can't steal the session and use it elsewhere.

**What it costs:** auth endpoints, cookie handling, refreshing, an origin check and our own rate limiting are now ours to build and maintain. The email templates link to our API instead of Supabase. The web app and the API must stay on the same site. An XSS attacker can still act as the user while the page is open; cookies stop the session from being stolen, not misused.
