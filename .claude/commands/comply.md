---
description: Record that a notice has been complied with, with the evidence.
---

Read CLAUDE.md. Record that a notice has been complied with, with the evidence.

Run `npm run consent -- comply <notice> --evidence= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
