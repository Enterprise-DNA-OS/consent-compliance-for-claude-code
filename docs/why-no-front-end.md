# Why there is no front end

CS-VUE is a database with a subscription. The records underneath it are ordinary: sites, consents, conditions, due dates, monitoring results, incidents, inspections and notices. What you pay for is the layer on top that lets people who do not write SQL get at those records. Screens, filters, dashboards, reminder emails.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a chart for ("which consents expire before our next big contract ends?") and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, and get it answered from your own consent history.
- **No modules and no seats.** Site managers, the compliance lead and the board can all look. The bill does not grow with each module or person.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time.
- **Your consents, your way.** When a council adds a condition or changes a limit, you say so and the change is made the same day.

## What you give up

- **Live sensor screens.** Telemetry trends and alarms stay in your telemetry provider's system. This holds the daily totals and the results that matter for compliance; a live feed can be connected into the same database.
- **A phone form in the field.** Site staff record a reading or evidence by asking Claude Code, or a field form can be built on the same database.
- **Automatic reminder emails.** `/weekly-review` and `/attention` tell you what is due. Sending reminders is a step you add on purpose, with the people who should get them.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for businesses that want someone to call.

## Who this fits

Compliance leads, environmental advisers and site managers at quarries, contractors, food and dairy processors, irrigators, landfill and wastewater operators and developers who already use Claude Code, or who would rather learn to ask than learn another interface. If your team needs a screen to look at all day, keep CS-VUE. If you need the answers more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/cs-vue
