---
description: Record that a renewal application has been lodged for a consent.
---

Read CLAUDE.md. Record that a renewal application has been lodged for a consent.

Run `npm run consent -- renewal <consent> --reference= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

The output says whether it was lodged in time under RMA s124. If not, tell the operator to ask the council in writing whether the activity can continue.
