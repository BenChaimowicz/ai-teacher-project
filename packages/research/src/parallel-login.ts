import { repoRootFrom } from "@senoy/db";
import {
  accountFromTokens,
  parallelAccountPath,
  pollParallelToken,
  readParallelAccount,
  registerParallelClient,
  requestParallelDeviceCode,
  writeParallelAccount,
} from "./parallel-account.ts";

/**
 * `pnpm parallel:login`: signs this machine in to Parallel's Account API (read-only balance scope) through the device
 * flow and saves `.parallel-account.json` at the repo root. Prints the URL and code; opens nothing. After this, the
 * Usage Console API keeps the token fresh while it runs.
 */

/** Read-only: the console only reads the organization balance. */
const SCOPE = "balance:read";

/**
 * Runs the device flow in the terminal.
 */
async function login() {
  // packages/research/src → repo root is three directories up.
  const path = parallelAccountPath(repoRootFrom(import.meta.url, 3));
  const existing = await readParallelAccount(path).catch(() => null);
  const clientId = existing?.clientId ?? (await registerParallelClient());
  const code = await requestParallelDeviceCode(clientId, { scope: SCOPE });
  process.stdout.write([
    "",
    "Sign in to Parallel to let the Usage Console read your balance (read-only).",
    `  1. Open:  ${code.verificationUriComplete ?? code.verificationUri}`,
    `  2. Code:  ${code.userCode}`,
    `Waiting for approval (expires in ${Math.round(code.expiresInSeconds / 60)} min)...`,
    "",
  ].join("\n"));
  const tokens = await pollParallelToken(clientId, code);
  await writeParallelAccount(path, accountFromTokens(clientId, tokens, null, new Date()));
  process.stdout.write(`Saved ${path}. The Usage Console API (pnpm dash) picks it up on its next reading; press Refresh on the Billing check to read now.\n`);
}

try {
  await login();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[parallel-login.ts: login] Parallel login failed || ${message}\n`);
  process.exit(1);
}
