---
description: Add a condition to a consent: what it requires, who owns it, how often it falls due, and any limit it sets.
---

Read CLAUDE.md. Add a condition to a consent: what it requires, who owns it, how often it falls due, and any limit it sets.

Run `npm run consent -- add-condition <consent> --number= --kind=monitoring|reporting|limit|management_plan|notification|general --summary= [--wording=] [--owner=] [--every=<days>] [--first-due=YYYY-MM-DD] [--notify-within=<days>] [--point=] [--parameter=] [--unit=] [--max=] [--min=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Copy the condition number and summary from the consent itself. For a limit condition, add `--point`, `--parameter`, `--unit` and `--max` or `--min`, and `--notify-within` from the consent (days the regulator must hear within). Never invent a limit: ask for the consent wording.
