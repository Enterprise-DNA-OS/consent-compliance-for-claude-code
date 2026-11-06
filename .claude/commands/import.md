---
description: Import a conditions register and monitoring results exported from CS-VUE or a spreadsheet.
---

Read CLAUDE.md. Import a conditions register and monitoring results exported from CS-VUE or a spreadsheet.

Run `npm run consent -- import cs-vue [--conditions=conditions.csv] [--readings=readings.csv] [--dry-run] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Read docs/replace-cs-vue.md first. Always run with --dry-run, show the counts and problems, then import within the operator's authorised migration. Never guess a column. List any breaches the import reports for review.
