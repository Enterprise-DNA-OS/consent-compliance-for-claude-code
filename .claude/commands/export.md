---
description: Write a full snapshot of every record to a new JSON file.
---

Read CLAUDE.md. Write a full snapshot of every record to a new JSON file.

Run `npm run consent -- export --out=<new-file.json>`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Choose a new file name outside the repository or in `exports/` (ignored by git).
