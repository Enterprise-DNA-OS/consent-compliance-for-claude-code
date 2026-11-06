---
description: Record that the actions from an inspection are done.
---

Read CLAUDE.md. Record that the actions from an inspection are done.

Run `npm run consent -- inspection-done <inspection> [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
