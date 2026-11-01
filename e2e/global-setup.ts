import { loadRootEnv } from "@senoy/db";
import { createTestAccounts, deleteTestAccounts } from "./accounts.ts";

/**
 * Before the run: clears test accounts a crashed run left, then creates and signs in this run's.
 */
export default async function globalSetup() {
  loadRootEnv(import.meta.url, 1);
  await deleteTestAccounts();
  await createTestAccounts();
}
