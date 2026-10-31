import { sql } from "drizzle-orm";
import type { OpsSetupChecklist } from "@senoy/db/usage";
import type { SqlRunner } from "./ops-store.ts";

/**
 * The founders' shared setup checklist: domain, email, vendor access, and authentication email. The sections and items
 * live here and nowhere else; the database holds only who ticked which item and when (`setup_checklist_progress`), so
 * an item can never be duplicated by a reload. Item keys are stable: renaming a label keeps its progress, changing a
 * key starts it fresh. No item ever asks for a secret — those belong in the password manager.
 */

/** One section as written in code: its items are `[key, label]` pairs, keys unique across the whole list. */
type SectionDefinition = { key: string; title: string; intro: string; items: (readonly [string, string])[] };

/** Every section, in the order the founders work through them. */
export const SETUP_CHECKLIST: SectionDefinition[] = [
  {
    key: "vault",
    title: "Create the shared password vault",
    intro: "Everything secret goes here first, so nothing later ends up in a chat, an email, or this checklist.",
    items: [
      ["vault.create", "Create a shared vault named “Knibbler – Operations” in Bitwarden or 1Password."],
      ["vault.accounts", "Give each founder their own password-manager account and vault access."],
      ["vault.agree", "Agree to store vendor credentials, API keys, recovery codes, billing details, and renewal dates there."],
      ["vault.2fa", "Enable two-factor authentication on the password-manager accounts."],
      ["vault.offline", "Store emergency recovery information offline as well."],
    ],
  },
  {
    key: "domain",
    title: "Secure the domain",
    intro: "knibbler.app through Porkbun, locked down and reachable by both founders.",
    items: [
      ["domain.purchase", "Purchase knibbler.app through Porkbun after checking both purchase and renewal prices."],
      ["domain.whois", "Keep WHOIS privacy enabled."],
      ["domain.auto-renew", "Enable auto-renew."],
      ["domain.lock", "Enable domain lock."],
      ["domain.2fa", "Enable two-factor authentication on Porkbun."],
      ["domain.second-founder", "Give the second founder access using Porkbun’s authorized-user functionality; do not share the primary password."],
      ["domain.recovery-email", "Use a stable external email address for registrar recovery, not only an @knibbler.app address."],
      ["domain.receipt", "Save the purchase receipt and recovery information in the shared vault."],
      ["domain.no-extras", "Do not purchase hosting, a website builder, or a separate SSL certificate."],
    ],
  },
  {
    key: "workspace",
    title: "Set up founder email",
    intro: "Google Workspace on knibbler.app, with one mailbox and one admin per founder.",
    items: [
      ["workspace.create", "Create Google Workspace for knibbler.app."],
      ["workspace.mailboxes", "Create one individual mailbox for each founder."],
      ["workspace.account-security", "Give each account its own password, two-factor authentication, and recovery methods."],
      ["workspace.admins", "Ensure both founders can administer Google Workspace."],
      ["workspace.verify", "Verify domain ownership using the DNS record supplied by Google."],
    ],
  },
  {
    key: "roles",
    title: "Create shared role addresses",
    intro:
      "accounts@knibbler.app is a group or equivalent shared address that delivers to both founders — not attached to " +
      "only one founder’s mailbox. The others are routing addresses, not extra mailboxes. Only accounts@ is needed right away.",
    items: [
      ["roles.accounts", "Create accounts@knibbler.app as a shared address that delivers to both founders."],
      ["roles.founders", "Create founders@knibbler.app as a routing address."],
      ["roles.support", "Create support@knibbler.app as a routing address."],
      ["roles.privacy", "Create privacy@knibbler.app as a routing address."],
      ["roles.security", "Create security@knibbler.app as a routing address."],
    ],
  },
  {
    key: "dns",
    title: "Configure and test DNS email records",
    intro: "Add only what Google asks for, in Porkbun. DNS changes can take a while to show up; that is normal.",
    items: [
      ["dns.follow-google", "Follow Google Workspace’s current setup instructions."],
      ["dns.records", "Add the supplied MX, SPF, DKIM, and DMARC records in Porkbun."],
      ["dns.conflicting-mx", "Remove conflicting MX records only when Google’s instructions require it."],
      ["dns.one-spf", "Maintain one valid SPF record rather than multiple independent SPF records."],
      ["dns.dmarc-none", "Start DMARC in monitoring mode with p=none."],
      ["dns.leave-others", "Do not change unrelated DNS records or migrate nameservers."],
      ["dns.propagation", "Allow time for DNS propagation before assuming something is broken."],
    ],
  },
  {
    key: "email-test",
    title: "Test normal email",
    intro: "Confirm human email works end to end before anything automated depends on it.",
    items: [
      ["email-test.external", "Send an external email to accounts@knibbler.app."],
      ["email-test.both-receive", "Confirm both founders receive it."],
      ["email-test.send-reply", "Send and reply from each founder’s individual address."],
      ["email-test.gmail-outlook", "Test delivery to both Gmail and Outlook recipients."],
      ["email-test.spam", "Confirm messages are not landing in spam."],
      ["email-test.admin-recovery", "Confirm both founders can administer Workspace and recover their accounts."],
    ],
  },
  {
    key: "vendors",
    title: "Set up vendor access",
    intro: "Apply these steps to Supabase, OpenRouter, Parallel, You.com, and any other vendor.",
    items: [
      ["vendors.individual", "Prefer individual accounts and team invitations when supported."],
      ["vendors.shared-account", "Use accounts@knibbler.app when only one shared administrative account is supported."],
      ["vendors.both-admins", "Give both founders owner/admin access where appropriate."],
      ["vendors.2fa", "Enable two-factor authentication."],
      ["vendors.vault", "Store credentials and recovery codes in the shared vault."],
      ["vendors.billing", "Add billing information and spending alerts where available."],
      ["vendors.inventory", "Record each service, login address, access model, billing owner, and renewal information in a simple shared inventory."],
      ["vendors.supabase-owners", "Ensure Supabase has two organization owners."],
    ],
  },
  {
    key: "app-email",
    title: "Configure application email",
    intro: "Automated app email goes through its own provider and subdomain, separate from human email.",
    items: [
      ["app-email.provider", "Choose one transactional email provider, such as Resend or Postmark."],
      ["app-email.not-workspace", "Do not use Google Workspace or a personal inbox for automated app email."],
      ["app-email.subdomain", "Configure the sending subdomain auth.knibbler.app."],
      ["app-email.sender", "Configure the sender as: Knibbler <no-reply@auth.knibbler.app>"],
      ["app-email.dns", "Add the provider’s supplied DNS records exactly as instructed."],
      ["app-email.separate", "Keep application sending separate from normal human email."],
    ],
  },
  {
    key: "supabase-auth",
    title: "Connect Supabase Auth",
    intro: "Point Supabase Auth at the transactional provider and test every email it sends.",
    items: [
      ["supabase-auth.smtp-settings", "Obtain SMTP settings from the transactional email provider."],
      ["supabase-auth.custom-smtp", "Add custom SMTP settings in Supabase."],
      ["supabase-auth.sender", "Set the sender address to no-reply@auth.knibbler.app and sender name to Knibbler."],
      ["supabase-auth.click-tracking", "Disable click tracking for authentication messages if the provider supports it."],
      ["supabase-auth.signup", "Test signup confirmation."],
      ["supabase-auth.magic-link", "Test magic-link email if magic links are used."],
      ["supabase-auth.password-reset", "Test password reset."],
      ["supabase-auth.email-change", "Test email-address change."],
      ["supabase-auth.logs", "If delivery fails, inspect both Supabase and email-provider logs."],
      ["supabase-auth.secret-store", "Store SMTP credentials only in the appropriate secret/configuration store, never in this checklist or source control."],
    ],
  },
  {
    key: "drill",
    title: "Run a recovery drill",
    intro: "Pretend one founder is unavailable and confirm the other can do each of these alone.",
    items: [
      ["drill.porkbun", "Access Porkbun."],
      ["drill.vault", "Access the shared password vault."],
      ["drill.workspace", "Administer Google Workspace."],
      ["drill.accounts-email", "Receive accounts@knibbler.app email."],
      ["drill.vendors", "Access every critical vendor."],
      ["drill.recovery-codes", "Find recovery codes."],
      ["drill.payment", "Change the payment method."],
      ["drill.api-key", "Disable or rotate a compromised API key."],
    ],
  },
];

/** Every item key, for checking a request names a real item. */
const ITEM_KEYS = new Set(SETUP_CHECKLIST.flatMap((section) => section.items.map(([key]) => key)));

/**
 * Whether a key names an item on the checklist.
 * @param key - The key from the request
 */
export function isSetupChecklistItem(key: string): boolean {
  return ITEM_KEYS.has(key);
}

/** One stored progress row. */
export type SetupChecklistProgressRow = { itemKey: string; completedAt: string | null; completedBy: string | null };

/**
 * Lays the stored progress over the checklist in code. Rows for keys no longer in code are ignored; items with no row
 * are open.
 * @param rows - Every stored progress row
 * @param operator - Who this console ticks items as, or null
 * @returns The checklist with per-section and overall counts
 */
export function buildSetupChecklist(rows: SetupChecklistProgressRow[], operator: string | null): OpsSetupChecklist {
  const progress = new Map(rows.map((row) => [row.itemKey, row]));
  const sections = SETUP_CHECKLIST.map((section) => {
    const items = section.items.map(([key, label]) => {
      const row = progress.get(key);
      const completedAt = row?.completedAt ?? null;
      return { key, label, completedAt, completedBy: completedAt ? (row?.completedBy ?? null) : null };
    });
    const done = items.filter((item) => item.completedAt !== null).length;
    return { key: section.key, title: section.title, intro: section.intro, items, done, total: items.length };
  });
  return {
    sections,
    done: sections.reduce((sum, section) => sum + section.done, 0),
    total: sections.reduce((sum, section) => sum + section.total, 0),
    operator,
  };
}

/** Reads and ticks the shared checklist. */
export type SetupChecklistService = {
  /** Who this console ticks items as (`CONSOLE_OPERATOR`); null means it can read but not tick. */
  operator: string | null;
  /** The whole checklist with its progress. */
  read(): Promise<OpsSetupChecklist>;
  /**
   * Ticks or unticks one item and returns the whole checklist. Ticking an item that is already ticked keeps who ticked
   * it first, so two founders ticking at once do not overwrite each other; unticking clears both.
   */
  setDone(itemKey: string, done: boolean): Promise<OpsSetupChecklist>;
};

/**
 * Builds the checklist service over Postgres.
 * @param run - Runs one SQL statement
 * @param operator - Who this console ticks items as (`CONSOLE_OPERATOR`), or null
 * @returns The service
 */
export function createSetupChecklistService(run: SqlRunner, operator: string | null): SetupChecklistService {
  /**
   * Reads every stored progress row.
   * @returns The rows, timestamps as ISO strings
   * @throws Error when the query fails
   */
  async function read(): Promise<OpsSetupChecklist> {
    try {
      const rows = await run(sql`select item_key as "itemKey", completed_at as "completedAt", completed_by as "completedBy"
        from setup_checklist_progress`);
      return buildSetupChecklist(
        rows.map((row) => ({
          itemKey: String(row.itemKey),
          completedAt: row.completedAt ? new Date(row.completedAt as string | Date).toISOString() : null,
          completedBy: row.completedBy ? String(row.completedBy) : null,
        })),
        operator,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[setup-checklist.ts: read] Failed to read setup checklist progress || ${message}`);
    }
  }

  return {
    operator,
    read,
    async setDone(itemKey, done) {
      try {
        await run(
          done
            ? sql`insert into setup_checklist_progress (item_key, completed_at, completed_by, updated_at)
                values (${itemKey}, now(), ${operator}, now())
                on conflict (item_key) do update set
                  completed_by = case when setup_checklist_progress.completed_at is null
                    then excluded.completed_by else setup_checklist_progress.completed_by end,
                  completed_at = coalesce(setup_checklist_progress.completed_at, excluded.completed_at),
                  updated_at = now()`
            : sql`update setup_checklist_progress set completed_at = null, completed_by = null, updated_at = now()
                where item_key = ${itemKey}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[setup-checklist.ts: setDone] Failed to save setup checklist progress || itemKey=${itemKey} || done=${done} || ${message}`);
      }
      return read();
    },
  };
}
