---
date: 2026-10-31
tickets:
people: Yarden
status: active
---

# Founder email on knibbler.app runs on Zoho Mail's Forever Free plan, not Google Workspace

The setup checklist planned Google Workspace Business Starter, which is paid per founder per month. Yarden asked for a free alternative. Zoho Mail Forever Free is the only free option that still meets the checklist as written: a real mailbox for each founder, both founders as admins, a shared `accounts@` that reaches both of them, and its own domain verification in Porkbun DNS.

Alternatives we turned down: Porkbun's free forwarding, because it can only receive mail, sending needs an SMTP workaround and there are no real accounts to administer or recover. That's a weak base for `accounts@`, the login and recovery address for every vendor. Cloudflare Email Routing has the same limits and would also mean moving nameservers off Porkbun, which the checklist rules out.

What it costs: the free plan works only in Zoho's web and mobile apps, with no IMAP/POP, so no Outlook or Apple Mail. Storage is about 5 GB per user, the plan allows at most 5 users, and Zoho can cut the free tier further. If we outgrow it, moving to a paid plan or to Workspace means migrating mailboxes and swapping MX, SPF and DKIM records.
