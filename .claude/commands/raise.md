---
description: Open a non-compliance by hand: a spill, missed monitoring, a late report, a complaint that shows a breach.
---

Read CLAUDE.md. Open a non-compliance by hand: a spill, missed monitoring, a late report, a complaint that shows a breach.

Run `npm run consent -- raise --consent= --kind=exceedance|missed_monitoring|late_report|spill|complaint|other --description= [--condition=] [--found=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Say who must be told and by when, from the output. Never decide for the operator whether a breach is notifiable beyond what the consent says.
