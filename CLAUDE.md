# Consent Compliance for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs attention this week | `/attention` |
| Everything about one site, consent or incident | `/site`, `/consent`, `/incident` |
| What is due this month | `/due` (every condition: `/conditions`) |
| A condition was met (report lodged, survey done) | `/met` |
| A lab result or meter volume came in | `/reading` (opens an incident on a breach) |
| Anything over a limit | `/readings`, `/exceedances` |
| Water meters and daily records | `/water`, `/verify-meter` |
| Something went wrong that is not one result | `/raise` |
| We told the council or EPA | `/notify` |
| Close an incident | `/close-incident` |
| Every incident | `/incidents` |
| Renewals and lapse dates | `/renewals`, `/renewal`, `/commenced`, `/draft-renewal` |
| A council inspection | `/inspection`, `/inspection-done`, `/inspections` |
| An abatement or infringement notice | `/notice`, `/comply`, `/draft-response`, `/notices` |
| Management plans | `/plans`, `/review-plan`, `/test-plan` |
| A complaint from a neighbour | `/log-complaint`, `/respond`, `/close-complaint`, `/complaints` |
| A new consent or condition | `/add-consent`, `/add-condition` |
| Every site and consent | `/sites`, `/consents` |
| Evidence recorded lately | `/evidence` |
| How each site is doing | `/stats` |
| Are we compliant | `/compliance` |
| Draft the notification to the regulator | `/draft-notification` |
| The annual compliance report | `/annual-report` |
| The Monday review | `/weekly-review` |
| Bring data across from CS-VUE or a spreadsheet | `/import` (test run first) |
| A full copy of the data | `/export` |
| Who recorded what | `/activity` |
| Every command | `/help` |
| Change a field, a limit or a due rule | `/customise` |
| A new printable page | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run consent -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- A reading or a piece of evidence is never edited or deleted. A wrong one is answered with a new entry and a note.
- A breach of a consent limit is raised to the operator the moment it is recorded: say who must be told, by when, and offer the draft. Never decide for them whether to tell the regulator beyond what the consent says.
- Nothing here contacts a council, the EPA or a neighbour. Notifications, renewal packs and responses are drafted; a person sends or lodges them and then records it with `/notify`, `/renewal` or `/comply`.
- Limits and due rules come from the consent wording. Never change a limit or a frequency without the operator naming the condition it comes from.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off CS-VUE.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/cs-vue
