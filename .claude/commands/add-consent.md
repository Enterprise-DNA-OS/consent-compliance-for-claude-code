---
description: Register a resource consent or environment protection licence for a site.
---

Read CLAUDE.md. Register a resource consent or environment protection licence for a site.

Run `npm run consent -- add-consent --site= --reference= --kind=land_use|water_permit|discharge_permit|coastal_permit|subdivision|epa_licence --activity= --granted=YYYY-MM-DD [--expires=YYYY-MM-DD] [--commenced=YYYY-MM-DD] [--lapse=YYYY-MM-DD] [--holder=] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run consent -- consent <code>`, `site <code>` or `incident <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
