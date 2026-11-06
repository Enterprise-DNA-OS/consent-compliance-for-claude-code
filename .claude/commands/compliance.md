---
description: Check the records against the consent and licence rules in docs/compliance.md and report what is missing, late or breached, with the rule and its source.
---

1. Read `docs/compliance.md`. Each rule has a name, its source, what a breach looks like in the data, and the check that finds it.
2. Run `npm run consent -- compliance` (add `--json` for structured results).
3. Report as a table: rule, count, the worst example, the source. The right to operate first (RMA-EXPIRED, RMA-S124-RENEWAL, RMA-S125-LAPSE), then the regulator (NOTIFY-REGULATOR, ABATEMENT, LIMIT), then conditions, water records and plans.
4. For anything breached, offer the fix the operator can approve: the incident to raise, the notification to draft (`/draft-notification`), the renewal pack (`/draft-renewal`), the evidence to record (`/met`). Drafts go to `drafts/`; nothing is lodged or sent from here.
5. If a rule in `docs/compliance.md` looks out of date, say so and stop. Do not guess at law. The operator confirms the rule, then you update the doc and the check together.

Nothing here is legal advice. The doc records the rules the operator has told the system to enforce, with sources, and this command checks the data against them.
