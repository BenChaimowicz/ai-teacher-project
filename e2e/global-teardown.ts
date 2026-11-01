import { loadRootEnv } from "@senoy/db";
import { deleteTestAccounts } from "./accounts.ts";

/**
 * After the run: deletes this run's test accounts from the shared Supabase project.
 */
export default async function globalTeardown() {
  loadRootEnv(import.meta.url, 1);
  await deleteTestAccounts();
}
