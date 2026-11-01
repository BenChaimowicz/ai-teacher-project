# The session lives in httpOnly cookies that the API sets, and every sign-in flow goes through the API

ADR 0026 kept the Supabase session in the browser's `localStorage` and sent the access token as a bearer header. A script injected into the page could read that token and use it from anywhere. Yarden chose to keep the session where page scripts cannot reach it (decision 2026-11-01). Everything else in ADR 0026 still holds:
- Supabase Auth owns identity.
- `learners.auth_user_id` links a Learner to its user, and the Learner is created on the user's first call.
- The API checks the access token locally, against the project's ES256 keys.
- Ownership checks live in the API.

**The API owns the session.** The web app no longer uses `supabase-js`. It calls our API, and the API calls Supabase Auth with the publishable key. For a signed-in action, it uses a per-request client with that Learner's session set on it. Every route in this table is open: it needs no session, except where it says otherwise.

| Route | Does |
|---|---|
| `POST /api/auth/sign-up` `{ email, password }` | Supabase `signUp`, with `emailRedirectTo` set to `<origin>/api/auth/confirm?next=/`. Always answers `204`, whether or not the email exists. |
| `POST /api/auth/resend` `{ email }` | Sends the welcome email again. `204`. |
| `POST /api/auth/sign-in` `{ email, password }` | Password sign-in. Sets the cookies. A wrong email or password gets `401`; an unconfirmed email gets `403` `{ code: "email_not_confirmed" }`. |
| `POST /api/auth/code` `{ email }` | Emails a 6-digit code, never creating a user. Always `204`. |
| `POST /api/auth/code/verify` `{ email, code }` | Checks the code and sets the cookies. A wrong or expired code gets `401`. |
| `POST /api/auth/forgot` `{ email }` | Sends the reset email, linking to `<origin>/api/auth/confirm?next=/reset-password`. Always `204`. |
| `GET /api/auth/confirm?token_hash&type&next` | The email links land here. Supabase `verifyOtp({ token_hash, type })`, then sets the cookies and redirects (`303`) to `next`, which may only be a path on our site. A bad or used link redirects to `/sign-in?link=expired`. |
| `POST /api/auth/password` `{ password }` | Signed in only. Changes the password. |
| `POST /api/auth/sign-out` `{ scope: "local" \| "global" }` | Revokes this session or all of them at Supabase, then clears the cookies. `204`. |

`<origin>` is the request's own origin, so the dev server, e2e and production each get links back to themselves. Supabase only accepts redirect targets listed in `auth/settings.json`. The email templates link to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=…`, not to Supabase's own verify page.

**Cookies.**
- `kn_at` holds the access token and `kn_rt` the refresh token. Both are `HttpOnly`, `SameSite=Lax`, `Path=/api`, and `Secure` when the request came over HTTPS. They last 400 days and are refreshed on use.
- The auth hook reads `kn_at`, which replaces the `Authorization` header.
- When the access token has expired but `kn_rt` is present, the hook refreshes the session at Supabase, sets both cookies again, and carries on with the request. The Learner never sees it. If the refresh fails, the cookies are cleared and the reply is `401`.
- Requests that arrive at the same moment may each refresh. Supabase accepts a refresh token that was used within the last few seconds, so they don't sign the Learner out.

**Cross-site requests.** Any `/api/*` request that isn't `GET`, `HEAD` or `OPTIONS` is refused with `403` when its `Origin` is another site, or when `Sec-Fetch-Site` says `cross-site`. Browsers send these headers, and only a browser can carry a Learner's cookies. Together with `SameSite=Lax`, this closes CSRF without a token.

**Rate limits.** Supabase now sees every sign-in coming from the API's one address, so its own per-IP limits would apply to everyone combined. The API limits the `/api/auth/*` routes that send email or check a credential: per client IP, and per email address as well. It answers `429` with a plain message. The numbers are constants in the auth routes. Supabase's project-wide limits are raised so they never bind before ours.

**The web app.**
- `apiFetch` sends cookies, which happens by default for same-origin calls, and no longer adds a header. A `401` still sends the person to sign-in.
- The auth provider learns who is signed in from `GET /api/me`.
- The reset-password page is reached signed in, through the confirm redirect, and posts to `/api/auth/password`.

**E2E.** Before the run, each test account signs in from Node, and its `kn_at` and `kn_rt` cookies are written into Playwright storage state. `page.request` then sends them like a browser would.

Rejected:
- **Tokens in `localStorage`** (ADR 0026 as first written). This is less code and keeps Supabase's per-IP limits, but a script injected into the page can steal the session.
- **`@supabase/ssr` in the browser, with readable cookies.** It is built for server-rendered frameworks. Its cookies must be readable by page scripts, which defeats the purpose.
- **A server-side sessions table** holding Supabase's tokens behind our own session id. It would hide the tokens even from the cookie jar, but it adds a table, a lookup on every request, and expiry handling that duplicates Supabase's.
- **CSRF tokens.** `SameSite=Lax` and the origin check cover the browsers we support, without a token in every form.

What it costs: the auth routes, cookie handling, refresh, the origin check and the rate limits are ours to keep correct. The web app and the API must be served from the same site (SEN-106). An injected script can still act as the Learner while the page is open; cookies stop the session from being stolen, not misused.
