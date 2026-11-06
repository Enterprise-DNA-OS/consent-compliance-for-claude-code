<h1 align="center">Consent Compliance for Claude Code</h1>

<p align="center">
  <strong>The open-source resource consent compliance system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your CS-VUE data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=cs-vue">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/cs-vue?utm_source=github&utm_medium=readme&utm_campaign=cs-vue">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-cs-vue">Instead of CS-VUE</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Consent Compliance for Claude Code does the job you pay CS-VUE for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the CS-VUE dashboard cannot.

CS-VUE does not publish a price on its own site. Software directories list it from a yearly price per feature, with Essential, Enterprise and Advanced Insights plans quoted per client ([capterra.co.nz](https://www.capterra.co.nz/software/138735/cs-vue-suite), checked 2026-11-06). A business that needs consents, monitoring and reporting pays for each module, every year, to keep a list of its own conditions.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=cs-vue).

It is resource consent and environmental licence compliance for the business that holds them: quarries, civil contractors, food and dairy processors, irrigators, landfill and wastewater operators, developers, and recycling yards with a New South Wales environment protection licence. It holds every site, consent and condition with its due rule, the evidence that meets each one, monitoring points with the consent's limits, and every reading checked against them. A reading over a limit opens an incident in the same step, and each incident tracks when the council or EPA had to hear and when it did. Renewal and lapse dates under the Resource Management Act, water meter records and verification, council inspections, abatement and infringement notices, management plans and neighbour complaints sit alongside.

### Ten questions CS-VUE will not answer for you

These run against the demo data today. Ask them in plain words.

1. Which breaches of a consent limit has nobody raised an incident for?
2. Which consents are past the six-month renewal date with no application lodged?
3. Which incidents has the council or EPA not been told about, and how late are we?
4. Which conditions are overdue right now, and who owns each one?
5. Which water meters are missing daily records this month, and how many days?
6. How many days, on average, do we take to tell the regulator after a breach, by site?
7. Which abatement notices fall due in the next fortnight?
8. Which consents will lapse soon because we have not given them effect?
9. Which inspection actions are overdue, and what grade did each site get this year?
10. Which complaints from neighbours has nobody answered yet?

### Your first hour: ten things to ask for

1. "What needs attention this week?" (`/attention`)
2. "Set up our quarry: Ruahine Quarry, Horizons Regional Council, with the land use consent LUC-2009-0144 and the stormwater permit DIS-2001-0871." (`/add-consent`)
3. "Condition 4 of the stormwater permit says suspended solids at the pond outlet must stay under 100 g/m3, and we tell the council within a day of a breach." (`/add-condition`)
4. "Bring across our conditions register from CS-VUE." (`/import`, test run first)
5. "What is due this month, and who owns it?" (`/due`, or `npm run view` for the printable calendar)
6. "The lab says suspended solids were 74 at the outfall on Tuesday." (`/reading` opens the incident)
7. "Draft the notification to Waikato Regional Council for NC-0004." (`/draft-notification`)
8. "When do we have to lodge the renewal for the water permit, and what goes in it?" (`/draft-renewal`)
9. "Put our logo and colours on the consent summaries." (edit `brand.json`, then `npm run docs`)
10. "Write the Monday compliance review." (`/weekly-review`)

### Documents and views

- `npm run docs` renders a compliance summary for every active consent (conditions, monitoring against limits, incidents, inspections and notices) and an incident report for every incident, in your brand (`brand.json`), into `docs-out/`.
- `npm run view` renders the week, the compliance calendar, the consent register and monitoring against limits as read-only HTML pages into `views/`.
- `/compliance` checks the records against the rules in [docs/compliance.md](docs/compliance.md), each with its source.
- `/draft-notification`, `/annual-report`, `/draft-renewal`, `/draft-response` and `/weekly-review` write drafts to `drafts/`. Nothing is ever sent or lodged from here.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/consent-compliance-for-claude-code.git
cd consent-compliance-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. On the demo data it finds a water take over its daily limit and a wastewater discharge over its suspended solids limit with no incident raised, an oil spill the EPA has not been told about, an abatement notice due in ten days, and a water permit whose six-month renewal date has already passed.

Or from the terminal: `npm run consent -- attention`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | What needs a person this week: breaches nobody owns, the regulator not told, notice deadlines, renewal windows, overdue conditions, missing water records. |
| `/sites`, `/site` | Every site, or everything about one: consents, attention, conditions due, incidents, plans. |
| `/consents`, `/consent` | Every consent and licence, or one in full: dates, renew-by date, conditions, limits, incidents, inspections, notices. |
| `/conditions`, `/due` | Every condition with its next due date, and the calendar for the next 30 days. |
| `/met` | Record the evidence a condition was met. Evidence is never edited. |
| `/reading` | Record a monitoring result or a daily meter volume. A breach opens an incident in the same step. |
| `/readings`, `/exceedances` | Recent results with verdicts, and every breach in the last year with whether an incident covers it. |
| `/water`, `/verify-meter` | Water takes of 5 L/s or more: daily records, volume against the limit, meter verification. |
| `/raise`, `/incidents`, `/incident` | Open an incident by hand; every incident; one in full. |
| `/notify`, `/close-incident` | Record that the regulator was told; close with cause and corrective action, refused until told. |
| `/renewals`, `/renewal`, `/commenced` | Expiry and lapse dates with the RMA s124 renew-by date; record a renewal lodged or a consent given effect. |
| `/inspection`, `/inspection-done`, `/inspections` | Council and EPA inspections, grades and actions. |
| `/notice`, `/comply`, `/notices` | Abatement, infringement and EPA notices and their comply-by dates. |
| `/plans`, `/review-plan`, `/test-plan` | Management plans, reviews, and incident response plan tests. |
| `/log-complaint`, `/respond`, `/close-complaint`, `/complaints` | Complaints from neighbours, answered and linked to incidents. |
| `/add-consent`, `/add-condition` | Register a consent; add a condition with its due rule and any limit. |
| `/evidence`, `/stats` | Evidence in the last 90 days; by site, conditions met, breaches and days to tell the regulator. |
| `/compliance` | The records checked against the rules in docs/compliance.md. |
| `/draft-notification` | The notification to the council or EPA, drafted from the incident. |
| `/annual-report` | A consent's annual compliance report: conditions, monitoring, incidents, complaints. |
| `/draft-renewal` | The renewal pack: renew-by date, conditions, compliance history and a checklist. |
| `/draft-response` | The written response to an abatement or other notice. |
| `/weekly-review` | The Monday review, written from attention, open incidents and conditions due. |
| `/import`, `/export` | Bring a conditions register and results across from CS-VUE; snapshot every table. |
| `/activity`, `/help` | The append-only log, and every command. |
| `/customise`, `/new-view` | Change a field, limit or due rule; add a printable page. |

## Instead of CS-VUE

CS-VUE exports are set up per client, so the importer accepts the common column names of a conditions register (consent number, condition number, type, description, responsible person, frequency, next due) and of a monitoring results file (monitoring point, date, determinand, result, units, lab reference), and refuses anything it cannot map rather than guessing. Always run a test first:

```bash
npm run consent -- import cs-vue --conditions=imports/conditions.csv --readings=imports/readings.csv --dry-run --actor="Your Name"
```

Imported breaches are listed for review rather than raised as new incidents, because CS-VUE may already hold them. The full guide, with what maps and what does not carry over: [docs/replace-cs-vue.md](docs/replace-cs-vue.md).

## Architecture

```
consent-compliance-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Consent Compliance for Claude Code for your business, migrates your CS-VUE data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=cs-vue)
- Read more: [enterprisedna.co/omni/instead-of/cs-vue](https://enterprisedna.co/omni/instead-of/cs-vue?utm_source=github&utm_medium=readme&utm_campaign=cs-vue)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
