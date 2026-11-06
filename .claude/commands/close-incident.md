---
description: Close an incident with its cause, the corrective action and a close-out note.
---

Read CLAUDE.md. Close an incident with its cause, the corrective action and a close-out note.

Run `npm run consent -- close-incident <incident> --cause= --corrective-action= --note= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Refused until the regulator has been told for an exceedance or spill.
