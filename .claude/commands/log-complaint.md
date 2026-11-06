---
description: Log a complaint from the public about dust, odour, noise, water or traffic.
---

Read CLAUDE.md. Log a complaint from the public about dust, odour, noise, water or traffic.

Run `npm run consent -- log-complaint --site= --kind=dust|odour|noise|water|traffic|other --detail= [--location=] [--on=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
