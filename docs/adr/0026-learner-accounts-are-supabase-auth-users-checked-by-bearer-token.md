# Learner accounts are Supabase Auth users, and the API checks a bearer token

Until SEN-110 the API loaded the first `learners` row on every request, so anyone who could reach it was the one Learner. Learners now sign up and sign in with Supabase Auth, which our Supabase project already includes (decision 2026-10-31). Supabase owns identity: emails, password hashes, Google identities, sessions and refresh tokens, in its `auth` schema. Our tables own everything else.

**Sign-in happens in the browser.** The web app uses `supabase-js` to talk to Supabase Auth directly, for:
- sign-up with email and password, or Google
- sign-in with email and password, Google, or a 6-digit code sent by email
- email verification
- forgot and change password
- sign-out, here or everywhere

The API never sees a password, and it has no auth endpoints of its own. Supabase hashes the passwords, rate-limits its endpoints, and answers sign-up and reset the same way whether or not an email exists. The password rule (8 characters, with a letter and a digit) is set in Supabase and repeated in the web app's forms. Supabase sends the auth emails through Resend over SMTP, using templates kept in the repo (decision 2026-11-01).

**The API checks a bearer token.** Every `/api/*` call carries `Authorization: Bearer <access token>`, the JWT that `supabase-js` holds and refreshes. The API checks it with `jose` against the project's public keys at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (ES256). It also checks the issuer `<SUPABASE_URL>/auth/v1`, the audience `authenticated`, and the expiry. `jose` caches the keys, so a request costs no network call to Supabase. That matters while a database round trip already costs about 230 ms (SEN-98). A missing, invalid or expired token gets a 401, and the web app sends the person to sign-in. `/api/health` stays open.

**A Learner points at its Supabase user.** `learners.auth_user_id` holds the Supabase user id, and it is unique. A Learner's own `id` stays our own, and every Learner-owned row keeps pointing at it. The request hook finds the Learner by `auth_user_id`. On a user's first call, it creates the Learner with a random learning-themed display name (`Curious_Owl`), which the Learner can change in Settings (decision 2026-10-31). The create is an insert that does nothing on conflict, followed by the read, so two first calls at once still make one Learner. There is no foreign key to `auth.users`: that schema is Supabase's, and the e2e run's throwaway Postgres doesn't have it. Nothing deletes accounts yet, so nothing leaves an orphan.

The prototype's seeded Learner keeps everything it owns, including the Usage Console history. `pnpm db:claim-learner <email>` hands it to our first account, a test account, by setting its `auth_user_id` (decision 2026-11-01). It refuses if that account already has a Learner that owns anything.

**Ownership is the API's job.** The API connects as the database owner, so Supabase's row-level security never applies to it. Every route reads and writes only rows whose `learner_id` is `currentLearner.id`. A row id belonging to another Learner gets the same 404 as an id that does not exist. API tests swap in a stand-in token check and prove that between two Learners.

**Sign out everywhere** revokes every refresh token for the user. An access token already issued stays valid until it expires, at most one hour (Supabase's default).

Rejected:
- **An httpOnly cookie session**, which SEN-110 first asked for. We would need session endpoints in the API, or `@supabase/ssr` sitting between the browser and Auth, plus CSRF protection, because the SPA and the API would share the cookie. A bearer header is never sent by the browser on its own, so CSRF does not apply. The cost is that the token sits in `localStorage`, where a script injected into the page (XSS) could read it.
- **Asking Supabase about every request (`auth.getUser`).** It would see a revoked session at once, but it adds a network round trip to every call. A local check is the standard, and the one-hour expiry bounds how long a revoked token still works.
- **`learners.id` equal to the Supabase user id.** That needs no extra column, but handing the seeded Learner to an account would mean re-keying every table that points at it, in one migration on shared data.
- **A database trigger on `auth.users` that creates the Learner.** It would put app logic inside Supabase's schema. The e2e Postgres doesn't have that schema, and the random name would be generated in SQL instead of in tested TypeScript.
- **Our own auth (argon2id, a sessions table, our own reset tokens), Clerk, or Auth.js.** See the decision of 2026-10-31.
