import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

/**
 * Test accounts on the shared Supabase project (decision 2026-10-31). Each run creates already-confirmed accounts,
 * signs them in from Node, and saves each session as the API's `kn_at` / `kn_rt` cookies in Playwright storage state
 * (ADR 0027), so tests start signed in without any email, and `page.request` sends the cookies like the browser does.
 * Every account's email starts with `e2e-`, so teardown finds this run's accounts and any a crashed run left.
 */

/** Where this run's accounts and sessions are written; ignored by git. */
export const AUTH_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), ".auth");

/** The web app's origin in browser tests. Vite proxies `/api` to the API, so the browser sees one origin. */
export const WEB_ORIGIN = "http://127.0.0.1:4190";

/** How long the session cookies last, as the API sets them (400 days). */
const COOKIE_LIFETIME_SECONDS = 400 * 24 * 60 * 60;

/** Emails of test accounts start with this; nothing else on the project may. */
const EMAIL_PREFIX = "e2e-";

/** Accounts each run creates: `a` owns the fixture data, `b` is the other Learner. */
const NAMES = ["a", "b"] as const;

/** One test account, as the tests read it. */
export type TestAccount = { id: string; email: string; password: string; storageState: string };

/** Every test account this run made, by name. */
export type TestAccounts = Record<(typeof NAMES)[number], TestAccount>;

/**
 * The project URL and a key from the root `.env`.
 * @param key - Which key: the secret key for admin calls, the publishable key for signing in
 */
function supabase(key: "SUPABASE_SECRET_KEY" | "SUPABASE_PUBLISHABLE_KEY") {
  const url = process.env.SUPABASE_URL;
  const value = process.env[key];
  if (!url || !value) {
    throw new Error(`[accounts.ts: supabase] Missing Supabase settings || SUPABASE_URL=${url ? "set" : "missing"} || ${key}=${value ? "set" : "missing"} || Add them to the root .env`);
  }
  return createClient(url, value, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Playwright storage state holding a session the way the API stores it: the `kn_at` (access token) and `kn_rt`
 * (refresh token) cookies, httpOnly, on `/api` for {@link WEB_ORIGIN}'s host.
 * @param session - The tokens from signing in
 */
function sessionState(session: { access_token: string; refresh_token: string }) {
  const domain = new URL(WEB_ORIGIN).hostname;
  const expires = Math.floor(Date.now() / 1000) + COOKIE_LIFETIME_SECONDS;
  const cookie = { domain, path: "/api", expires, httpOnly: true, secure: false, sameSite: "Lax" as const };
  return {
    cookies: [
      { ...cookie, name: "kn_at", value: session.access_token },
      { ...cookie, name: "kn_rt", value: session.refresh_token },
    ],
    origins: [],
  };
}

/**
 * Deletes every `e2e-` account on the project: this run's and any a crashed run left.
 */
export async function deleteTestAccounts() {
  const admin = supabase("SUPABASE_SECRET_KEY").auth.admin;
  try {
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const stale = data.users.filter((user) => user.email?.startsWith(EMAIL_PREFIX));
      for (const user of stale) {
        const { error: deleteError } = await admin.deleteUser(user.id);
        if (deleteError) throw deleteError;
      }
      if (data.users.length < 1000) return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[accounts.ts: deleteTestAccounts] Failed to delete test accounts || ${message}`);
  }
}

/**
 * Creates this run's confirmed accounts, signs each in, and writes its session cookies as storage state.
 * @returns The accounts, also written to `.auth/accounts.json` for the tests
 */
export async function createTestAccounts(): Promise<TestAccounts> {
  const admin = supabase("SUPABASE_SECRET_KEY").auth.admin;
  const auth = supabase("SUPABASE_PUBLISHABLE_KEY").auth;
  const run = `${Date.now().toString(36)}${process.pid}`;
  mkdirSync(AUTH_DIR, { recursive: true });
  const accounts = {} as TestAccounts;
  for (const name of NAMES) {
    const email = `${EMAIL_PREFIX}${run}-${name}@knibbler.app`;
    const password = `E2e-${crypto.randomUUID()}`;
    try {
      const { data: created, error: createError } = await admin.createUser({ email, password, email_confirm: true });
      if (createError) throw createError;
      const { data: signedIn, error: signInError } = await auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const storageState = resolve(AUTH_DIR, `${name}.json`);
      writeFileSync(storageState, JSON.stringify(sessionState(signedIn.session)));
      accounts[name] = { id: created.user.id, email, password, storageState };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[accounts.ts: createTestAccounts] Failed to create a test account || email=${email} || ${message}`);
    }
  }
  writeFileSync(resolve(AUTH_DIR, "accounts.json"), JSON.stringify(accounts, null, 2));
  return accounts;
}

/**
 * This run's accounts, as global setup wrote them.
 */
export function testAccounts(): TestAccounts {
  try {
    return JSON.parse(readFileSync(resolve(AUTH_DIR, "accounts.json"), "utf8")) as TestAccounts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[accounts.ts: testAccounts] No test accounts; run with \`pnpm test:e2e\` || ${message}`);
  }
}
