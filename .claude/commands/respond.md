---
description: Record the response to a complaint, and link the incident if it showed a breach.
---

Read CLAUDE.md. Record the response to a complaint, and link the incident if it showed a breach.

Run `npm run consent -- respond <complaint> --response= [--incident=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
