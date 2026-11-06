---
description: Record a council or EPA inspection with its grade, findings and the date actions are due.
---

Read CLAUDE.md. Record a council or EPA inspection with its grade, findings and the date actions are due.

Run `npm run consent -- inspection --consent= --officer= --grade=full|low_risk|moderate|significant [--findings=] [--actions-due=YYYY-MM-DD] [--on=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
