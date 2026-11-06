---
description: Record a management plan review, and its new version if it changed.
---

Read CLAUDE.md. Record a management plan review, and its new version if it changed.

Run `npm run consent -- review-plan <plan> [--version=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
