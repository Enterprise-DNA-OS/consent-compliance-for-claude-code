---
description: Record an abatement notice, infringement notice, enforcement order or EPA notice received.
---

Read CLAUDE.md. Record an abatement notice, infringement notice, enforcement order or EPA notice received.

Run `npm run consent -- notice --site= [--consent=] --kind=abatement|infringement|enforcement_order|excessive_noise|penalty_notice|clean_up_notice --issued-by= --reference= --requirement= [--comply-by=YYYY-MM-DD] [--amount=] [--on=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
