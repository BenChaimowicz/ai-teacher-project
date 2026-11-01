---
date: 2026-11-01
tickets:
people: Yarden
status: active
---

# The recovery drill is dropped from Knibbler Setup for now

Section 10, "Run a recovery drill", had 8 items. In it, one founder pretends the other is unavailable and checks they can reach Porkbun, the vault, Zoho Mail, `accounts@`, every vendor, the recovery codes and the payment method, and can rotate a leaked API key. Yarden said we don't need it for now. The checklist ends at section 9, Connect Supabase Auth, and the item count goes from 69 to 61.

**What we turned down:** keeping the section open as the last unticked part of the checklist.

**What it costs:** nothing proves yet that either founder can run everything alone. Sections 1–9 set up both founders as owners and admins, but no one has tested it. To bring the drill back, restore the section in `apps/console/src/server/setup-checklist.ts`; its old `drill.*` keys had no ticks, so nothing is lost.
