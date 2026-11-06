---
description: Draft the notification to the council or EPA for an incident.
---

Read CLAUDE.md. Draft the notification to the council or EPA for an incident.

Run `npm run consent -- draft-notification <incident>`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Check the regulator's preferred channel in the consent (email, portal, phone first). Once sent by a person, record it with `/notify`.

Writes a draft to drafts/. Read it, present the headline and path. Nothing is sent or lodged from here.
