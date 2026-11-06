---
description: Record the evidence that a condition was met: a report lodged, a survey done, a sample taken.
---

Read CLAUDE.md. Record the evidence that a condition was met: a report lodged, a survey done, a sample taken.

Run `npm run consent -- met <condition> --on=YYYY-MM-DD --by= [--reference=] [--note=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

The condition can be its code (RQY-LU1-5) or the attention list wording ("RQY-LU1 cond 5"). Evidence is never edited; a mistake is answered with a new entry and a note.
