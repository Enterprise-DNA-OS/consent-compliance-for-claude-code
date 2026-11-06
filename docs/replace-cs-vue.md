# Moving off CS-VUE

CS-VUE is set up per client, so every export looks a little different. This guide gets your consents, conditions and monitoring results out, checks them, and brings them in without guessing.

## 1. Export

1. **Your consents.** A list with the council's or EPA's reference, the kind, the activity, the grant date, the expiry date and whether it has been given effect. Most businesses have under 30, so these are set up by asking Claude Code ("add consent DIS-2001-0871, a discharge permit for quarry stormwater, granted 17 March 2002, expires 25 May 2027").
2. **The conditions register.** One row per condition with: consent number, condition number, condition type, description, responsible person, frequency and next due date. Save as CSV UTF-8.
3. **Monitoring results** (optional). One row per result with: monitoring point, date, determinand, result, units and lab reference. Daily water meter volumes come in the same way with the determinand "Volume".
4. **Incidents, inspections and notices.** Usually few enough to enter by asking Claude Code. Open ones first.

Keep the files out of the repository folder or under `imports/` (ignored by git).

## 2. Set up sites, consents and points

Every condition belongs to a consent and every result to a monitoring point. Add your sites, consents and points first. The importer matches the consent number to a consent's code or authority reference, and the monitoring point to a point's code or name.

## 3. Test run

```bash
npm run consent -- import cs-vue --conditions=imports/conditions.csv --readings=imports/readings.csv --dry-run --actor="Your Name"
```

The test run writes nothing. It reports how many conditions and readings are new, how many are already here, and every row it cannot map with the reason (an unknown consent, a missing number, a frequency it does not read, a bad date). Fix the file or add the missing consent, then run it again.

## 4. Import

Drop `--dry-run`. Nothing is imported while any row is wrong. Importing the same file twice adds nothing. Readings over a limit are listed for review rather than raised as incidents, because CS-VUE may already hold them; they show in `/attention` until you raise or review them.

## What maps

| CS-VUE column (any of) | Goes to |
|---|---|
| Consent Number, Consent, Authorisation, Permit Number, Licence Number | the consent (by code or authority reference) |
| Condition Number, Condition No, Number | `conditions.number` |
| Condition Type, Type, Category | `conditions.kind` (monitoring, reporting, limit, management plan, notification, general) |
| Description, Summary, Requirement, Title | `conditions.summary` |
| Responsible Person, Owner, Assigned To | `conditions.owner` |
| Frequency, Recurrence | `conditions.every_days` (daily, weekly, monthly, quarterly, six monthly, annually, a number of days; one-off and ongoing mean no repeat) |
| Next Due, Due Date | `conditions.first_due` (YYYY-MM-DD or DD/MM/YYYY) |
| Monitoring Point, Sample Point, Location | the point (by code or name) |
| Determinand, Parameter, Analyte | `readings.parameter` (common names such as total suspended solids, BOD and ammoniacal nitrogen map to TSS, BOD5 and NH4N) |
| Result, Value | `readings.value` and its qualifier ("<2" is less than 2) |

## What does not carry over

- Attachments (reports, photos, certificates). Keep them where they are and put the file name or link in the evidence reference.
- Reminder settings and user permissions. Attention and the weekly review replace the reminders; access is whoever can open the database.
- Sensor feeds. Connect your telemetry to the database directly, or import the daily totals.
- Limits on each condition. Add them with `/add-condition` (point, parameter, unit, maximum or minimum) so every reading is checked from the day you switch.

## Run both for a month

Keep CS-VUE for one reporting cycle. Each Monday compare `/attention` and `/due` with what CS-VUE says is due. When they agree, stop paying for the one you no longer open.
