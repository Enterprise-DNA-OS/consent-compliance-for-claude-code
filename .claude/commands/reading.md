---
description: Record a monitoring result or a daily water meter volume. A result over a consent limit opens an incident in the same step.
---

Read CLAUDE.md. Record a monitoring result or a daily water meter volume. A result over a consent limit opens an incident in the same step.

Run `npm run consent -- reading --point= --parameter= --value= [--qualifier=<|=|>] [--unit=] [--on=YYYY-MM-DD] [--source=lab|meter|field] [--lab-ref=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

A less-than result such as "<2" is `--qualifier=< --value=2`. If the output says an incident was opened, stop and tell the operator straight away: who must be told, by when, and offer `/draft-notification`.
