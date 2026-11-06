#!/usr/bin/env node
// The one CLI for Consent Compliance for Claude Code.
//
//   npm run consent -- help
//   npm run consent -- attention              # what needs a person this week
//   npm run consent -- consent TAF-DP1        # one consent, everything about it
//   npm run consent -- due --json             # machine output for any read
//
// Every write needs --actor=<who is doing it> and lands in the append-only activity log.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable, heading, truncate } from './lib/format.mjs';

const shown = (q, v) => `${q === '=' ? '' : q}${Number(v)}`;

// ------------------------------------------------------------------ reads

export const reads = {
  sites: {
    about: 'Every site: region, regulator, how many consents and conditions, open incidents.',
    sql: `select s.code, s.name, s.country, s.region, s.regulator,
            (select count(*) from consents c where c.site_id = s.id and c.status = 'active')::int as consents,
            (select count(*) from conditions co join consents c on c.id = co.consent_id where c.site_id = s.id and co.active and c.status = 'active')::int as conditions,
            (select count(*) from incident_register i where i.site = s.code and i.status = 'open')::int as open_incidents
          from sites s where s.active order by s.code`,
  },
  consents: {
    about: 'Every consent and licence: reference, kind, expiry, the renew-by date and whether a renewal is lodged.',
    sql: `select code, site, authority_ref, replace(kind, '_', ' ') as kind, granted_on, expires_on, renew_by,
            coalesce(renewal_ref, case when renewal_lodged_on is null then '' else 'lodged' end) as renewal, status
          from consent_register order by site, code`,
  },
  conditions: {
    about: 'Every active condition with its owner, how often it falls due and when it is next due.',
    sql: `select code, consent, number, kind, summary, owner, every_days, last_done, next_due
          from condition_due order by site, consent, length(number), number`,
  },
  due: {
    about: 'Conditions overdue or due in the next 30 days: the compliance calendar.',
    sql: `select site, consent, number, kind, summary, owner, next_due, days_overdue
          from condition_due where next_due <= current_date + 30 order by next_due, site, consent`,
  },
  renewals: {
    about: 'Consents expiring in the next 18 months or close to lapsing, with the RMA s124 renew-by date.',
    sql: `select code, site, authority_ref, replace(kind, '_', ' ') as kind, expires_on, renew_by, days_to_renew_by,
            renewal_lodged_on, renewal_ref,
            case when commenced_on is null then 'not given effect, lapses ' || lapse_on else '' end as lapse
          from consent_register
          where status = 'active' and ((expires_on is not null and expires_on <= current_date + 548) or (commenced_on is null and lapse_on <= current_date + 365))
          order by coalesce(renew_by, lapse_on)`,
  },
  readings: {
    about: 'Monitoring results from the last 90 days (not daily water volumes) with the verdict against each consent limit.',
    sql: `select site, point, taken_on, parameter, ${"case when qualifier = '=' then '' else qualifier end || value::float"} as result, unit,
            coalesce(case when max_value is null then '' else 'max ' || max_value::float end || case when min_value is null then '' else ' min ' || min_value::float end, '') as limit_value,
            verdict
          from reading_check where parameter <> 'VOLUME' and taken_on >= current_date - 90 order by taken_on desc, point, parameter`,
  },
  exceedances: {
    about: 'Every reading over or under a consent limit in the last year, and whether an incident covers it.',
    sql: `select site, point, taken_on, parameter, ${"case when qualifier = '=' then '' else qualifier end || value::float"} as result, unit,
            coalesce('max ' || max_value::float, 'min ' || min_value::float) as limit_value, condition, verdict,
            case when has_incident then 'yes' else 'NO' end as incident
          from reading_check where verdict in ('over limit','under minimum') and taken_on >= current_date - 365 order by taken_on desc, point`,
  },
  incidents: {
    about: 'Every non-compliance: what happened, when the regulator had to hear, when it did and whether it is closed.',
    sql: `select code, site, consent, replace(kind, '_', ' ') as kind, found_on, notify_by, notified_on, days_to_notify, regulator_ref, status, days_open
          from incident_register order by found_on desc, code`,
  },
  notices: {
    about: 'Abatement, infringement and other notices from the regulator, with the comply-by date.',
    sql: `select n.code, s.code as site, c.code as consent, replace(n.kind, '_', ' ') as kind, n.issued_on, n.issued_by, n.reference, n.requirement,
            n.comply_by, n.complied_on, case when n.complied_on is null and n.comply_by is not null then n.comply_by - current_date end as days_left
          from notices n join sites s on s.id = n.site_id left join consents c on c.id = n.consent_id order by n.complied_on nulls first, n.comply_by, n.code`,
  },
  inspections: {
    about: 'Council and EPA inspections: grade, findings and whether the actions are done.',
    sql: `select i.code, s.code as site, c.code as consent, i.inspected_on, i.officer, replace(i.grade, '_', ' ') as grade, i.findings, i.actions_due, i.actions_done_on
          from inspections i join consents c on c.id = i.consent_id join sites s on s.id = c.site_id order by i.inspected_on desc`,
  },
  plans: {
    about: 'Management plans: version, certified date, last review and, for incident response plans, last test.',
    sql: `select p.code, s.code as site, c.code as consent, p.name, p.kind, p.version, p.certified_on, p.last_reviewed_on,
            (p.last_reviewed_on + make_interval(months => p.review_every_months))::date as review_due, p.last_tested_on
          from plans p join sites s on s.id = p.site_id left join consents c on c.id = p.consent_id order by s.code, p.code`,
  },
  complaints: {
    about: 'Complaints from the public still open, and whether anyone has answered them.',
    sql: `select cp.code, s.code as site, cp.received_on, cp.kind, cp.location, cp.detail, cp.responded_on, current_date - cp.received_on as days_open
          from complaints cp join sites s on s.id = cp.site_id where cp.closed_on is null order by cp.received_on, cp.code`,
  },
  water: {
    about: 'Water takes of 5 L/s or more: daily records in the last 30 days, volume against the daily limit, meter verification.',
    sql: `select site, point, max_rate_ls::float as consented_ls, last_record, days_recorded_30d, days_missing_30d, m3_30d, max_m3_day, days_over_30d,
            meter_verified_on, verify_by
          from water_take order by site, point`,
  },
  evidence: {
    about: 'Evidence recorded in the last 90 days: which condition, when, by whom, with what reference.',
    sql: `select e.done_on, co.code as condition, co.summary, e.done_by, e.reference, e.note
          from evidence e join conditions co on co.id = e.condition_id where e.done_on >= current_date - 90 order by e.done_on desc, co.code`,
  },
  stats: {
    about: 'By site over 12 months: conditions met on time, breaches, incidents, days to tell the regulator, inspection grades.',
    sql: `select s.code as site,
            (select count(*) from condition_due d where d.site = s.code)::int as conditions,
            (select count(*) from condition_due d where d.site = s.code and d.days_overdue > 0)::int as overdue,
            (select count(*) from evidence e join conditions co on co.id = e.condition_id join consents c on c.id = co.consent_id
              where c.site_id = s.id and e.done_on >= current_date - 365)::int as evidence_12m,
            (select count(*) from reading_check r where r.site = s.code and r.verdict in ('over limit','under minimum') and r.taken_on >= current_date - 365)::int as breaches_12m,
            (select count(*) from incident_register i where i.site = s.code and i.found_on >= current_date - 365)::int as incidents_12m,
            (select round(avg(days_to_notify), 1)::float from incident_register i where i.site = s.code and i.days_to_notify is not null) as avg_days_to_notify,
            (select string_agg(replace(i.grade, '_', ' '), ', ' order by i.inspected_on desc) from inspections i join consents c on c.id = i.consent_id
              where c.site_id = s.id and i.inspected_on >= current_date - 365) as grades_12m
          from sites s where s.active order by s.code`,
  },
  attention: {
    about: 'What needs a person this week: breaches with no incident, the regulator not told, notice deadlines, renewals, overdue conditions.',
    sql: `select severity, site, item, rule, detail, days from site_attention order by severity, days desc nulls last, site, item`,
  },
  compliance: {
    about: 'Check the records against the rules in docs/compliance.md.',
    sql: null,
  },
  activity: {
    about: 'The append-only log of who changed what.',
    sql: `select created_at, actor, command, record_id, detail from activity order by id`,
  },
};

// Each rule matches a row in docs/compliance.md.
export const complianceRules = [
  { rule: 'RMA-S124-RENEWAL', sql: `select code, 'expires ' || expires_on || '; renew-by date ' || renew_by || ' passed with no application lodged' as finding
      from consent_register where country = 'NZ' and status = 'active' and expires_on >= current_date and renew_by < current_date and renewal_lodged_on is null` },
  { rule: 'RMA-EXPIRED', sql: `select code, 'expired ' || expires_on || ' with no renewal lodged; the activity has no consent' as finding
      from consent_register where status = 'active' and expires_on < current_date and renewal_lodged_on is null` },
  { rule: 'RMA-S125-LAPSE', sql: `select code, 'not given effect; lapses ' || lapse_on as finding
      from consent_register where country = 'NZ' and status = 'active' and commenced_on is null and lapse_on <= current_date + 180` },
  { rule: 'CONDITION', sql: `select consent || ' cond ' || number as code, summary || ', due ' || next_due || ', ' || days_overdue || ' days overdue' as finding
      from condition_due where next_due < current_date` },
  { rule: 'LIMIT', sql: `select point || ' ' || parameter || ' ' || taken_on as code,
        case when qualifier = '=' then '' else qualifier end || value::float || ' ' || unit || ' against ' || coalesce('max ' || max_value::float, 'min ' || min_value::float) || ' (' || condition || '), no incident raised' as finding
      from reading_check where verdict in ('over limit','under minimum') and not has_incident` },
  { rule: 'NOTIFY-REGULATOR', sql: `select code, case when notified_on is null then regulator || ' to be told by ' || notify_by || ', not told yet'
        else 'told ' || days_to_notify || ' days after it was found, window ' || notify_within_days || ' days' end as finding
      from incident_register where kind in ('exceedance','spill')
        and ((notified_on is null and status = 'open' and notify_by < current_date) or days_to_notify > notify_within_days)` },
  { rule: 'ABATEMENT', sql: `select n.code, n.kind || ' notice ' || n.reference || ' required "' || n.requirement || '" by ' || n.comply_by || '; not recorded as complied' as finding
      from notices n where n.complied_on is null and n.comply_by < current_date` },
  { rule: 'WATER-RECORDS', sql: `select point as code, days_missing_30d || ' of the last 30 days have no daily volume record' as finding from water_take where days_missing_30d > 0` },
  { rule: 'WATER-VERIFY', sql: `select point as code, case when meter_verified_on is null then 'no verification recorded' else 'verified ' || meter_verified_on || ', more than 5 years ago' end as finding
      from water_take where meter_verified_on is null or verify_by < current_date` },
  { rule: 'PLAN-REVIEW', sql: `select code, name || ' last reviewed ' || coalesce(last_reviewed_on::text, 'never') as finding from plans
      where last_reviewed_on is null or (last_reviewed_on + make_interval(months => review_every_months))::date < current_date` },
  { rule: 'PIRMP-TEST', sql: `select p.code, p.name || ' last tested ' || coalesce(p.last_tested_on::text, 'never') as finding
      from plans p join sites s on s.id = p.site_id where s.country = 'AU' and p.kind = 'pirmp' and (p.last_tested_on is null or p.last_tested_on < current_date - 365)` },
  { rule: 'EPL-ANNUAL-RETURN', sql: `select d.consent || ' cond R1' as code, 'annual return due ' || d.next_due || ', ' || d.days_overdue || ' days overdue' as finding
      from condition_due d join consents c on c.code = d.consent where c.kind = 'epa_licence' and d.number = 'R1' and d.next_due < current_date` },
];

// ------------------------------------------------------------------ usage

export const usage = {
  ...Object.fromEntries(Object.keys(reads).map((k) => [k, ''])),
  site: '<site code or name words>',
  consent: '<consent code or authority reference>',
  incident: '<incident code>',
  'add-consent': '--site= --reference= --kind=land_use|water_permit|discharge_permit|coastal_permit|subdivision|epa_licence --activity= --granted=YYYY-MM-DD [--expires=YYYY-MM-DD] [--commenced=YYYY-MM-DD] [--lapse=YYYY-MM-DD] [--holder=] [--code=] --actor=',
  'add-condition': '<consent> --number= --kind=monitoring|reporting|limit|management_plan|notification|general --summary= [--wording=] [--owner=] [--every=<days>] [--first-due=YYYY-MM-DD] [--notify-within=<days>] [--point=] [--parameter=] [--unit=] [--max=] [--min=] --actor=',
  met: '<condition> --on=YYYY-MM-DD --by= [--reference=] [--note=] --actor=',
  reading: '--point= --parameter= --value= [--qualifier=<|=|>] [--unit=] [--on=YYYY-MM-DD] [--source=lab|meter|field] [--lab-ref=] --actor=',
  raise: '--consent= --kind=exceedance|missed_monitoring|late_report|spill|complaint|other --description= [--condition=] [--found=YYYY-MM-DD] [--code=] --actor=',
  notify: '<incident> --on=YYYY-MM-DD --by= --reference= --actor=',
  'close-incident': '<incident> --cause= --corrective-action= --note= [--on=YYYY-MM-DD] --actor=',
  inspection: '--consent= --officer= --grade=full|low_risk|moderate|significant [--findings=] [--actions-due=YYYY-MM-DD] [--on=YYYY-MM-DD] [--code=] --actor=',
  'inspection-done': '<inspection> [--on=YYYY-MM-DD] --actor=',
  notice: '--site= [--consent=] --kind=abatement|infringement|enforcement_order|excessive_noise|penalty_notice|clean_up_notice --issued-by= --reference= --requirement= [--comply-by=YYYY-MM-DD] [--amount=] [--on=YYYY-MM-DD] [--code=] --actor=',
  comply: '<notice> --evidence= [--on=YYYY-MM-DD] --actor=',
  renewal: '<consent> --reference= [--on=YYYY-MM-DD] --actor=',
  commenced: '<consent> [--on=YYYY-MM-DD] --actor=',
  'verify-meter': '<point> --by= [--on=YYYY-MM-DD] --actor=',
  'review-plan': '<plan> [--version=] [--on=YYYY-MM-DD] --actor=',
  'test-plan': '<plan> [--on=YYYY-MM-DD] --actor=',
  'log-complaint': '--site= --kind=dust|odour|noise|water|traffic|other --detail= [--location=] [--on=YYYY-MM-DD] [--code=] --actor=',
  respond: '<complaint> --response= [--incident=] [--on=YYYY-MM-DD] --actor=',
  'close-complaint': '<complaint> [--on=YYYY-MM-DD] --actor=',
  import: 'cs-vue [--conditions=conditions.csv] [--readings=readings.csv] [--dry-run] --actor=',
  export: '--out=<new-file.json>',
  'draft-notification': '<incident>',
  'annual-report': '<consent> [--year=YYYY]',
  'draft-renewal': '<consent>',
  'draft-response': '<notice>',
  'weekly-review': '',
  help: '',
};

const mutating = new Set(['add-consent', 'add-condition', 'met', 'reading', 'raise', 'notify', 'close-incident', 'inspection', 'inspection-done',
  'notice', 'comply', 'renewal', 'commenced', 'verify-meter', 'review-plan', 'test-plan', 'log-complaint', 'respond', 'close-complaint', 'import']);
const CONSENT_KINDS = ['land_use', 'water_permit', 'discharge_permit', 'coastal_permit', 'subdivision', 'epa_licence'];
const CONDITION_KINDS = ['monitoring', 'reporting', 'limit', 'management_plan', 'notification', 'general'];
const INCIDENT_KINDS = ['exceedance', 'missed_monitoring', 'late_report', 'spill', 'complaint', 'other'];
const NOTIFIABLE = ['exceedance', 'spill'];
const GRADES = ['full', 'low_risk', 'moderate', 'significant'];
const NOTICE_KINDS = ['abatement', 'infringement', 'enforcement_order', 'excessive_noise', 'penalty_notice', 'clean_up_notice'];
const COMPLAINT_KINDS = ['dust', 'odour', 'noise', 'water', 'traffic', 'other'];
const SOURCES = ['lab', 'meter', 'field'];
const TABLES = ['sites', 'consents', 'conditions', 'evidence', 'points', 'limits', 'readings', 'incidents', 'inspections', 'notices',
  'plans', 'complaints', 'imports', 'activity'];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
function need(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw Error(`--${label} is required`);
  return v.trim();
}
function date(v, label, { past = false } = {}) {
  v = need(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw Error(`--${label} needs a real YYYY-MM-DD date`);
  if (past && v > today()) throw Error(`--${label} cannot be in the future`);
  return v;
}
const optDate = (v, label, opts) => (v === undefined ? null : date(v, label, opts));
function one(v, values, label) {
  if (!values.includes(v)) throw Error(`--${label} must be one of ${values.join(', ')}`);
  return v;
}
function num(v, label, { min = 0 } = {}) {
  const n = Number(need(v, label));
  if (!Number.isFinite(n) || n < min) throw Error(`--${label} must be a number${min === 0 ? ', zero or more' : ''}`);
  return n;
}
function int(v, label, lo, hi) {
  const n = Number(need(v, label));
  if (!Number.isInteger(n) || n < lo || n > hi) throw Error(`--${label} must be a whole number from ${lo} to ${hi}`);
  return n;
}
const paramCode = (v) => {
  const s = String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return PARAM_ALIASES[s] || s;
};
const PARAM_ALIASES = {
  TOTAL_SUSPENDED_SOLIDS: 'TSS', SUSPENDED_SOLIDS: 'TSS', BOD: 'BOD5', BIOCHEMICAL_OXYGEN_DEMAND: 'BOD5', AMMONIACAL_NITROGEN: 'NH4N',
  AMMONIA: 'NH4N', NH4_N: 'NH4N', DAILY_VOLUME: 'VOLUME', VOLUME_M3: 'VOLUME', DUST: 'DUST_DEPOSITION', DEPOSITED_DUST: 'DUST_DEPOSITION',
};

function parse(args) {
  const pos = [];
  const f = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) { pos.push(arg); continue; }
    const [key, ...rest] = arg.slice(2).split('=');
    if (Object.hasOwn(f, key)) throw Error(`Duplicate flag --${key}`);
    f[key] = rest.length ? rest.join('=') : true;
  }
  const cmd = pos.shift() || 'help';
  if (!Object.hasOwn(usage, cmd)) throw Error(`Unknown command "${cmd}". Run: npm run consent -- help`);
  const allowed = new Set(['json', ...[...usage[cmd].matchAll(/--([a-z-]+)/g)].map((m) => m[1])]);
  for (const k of Object.keys(f)) if (!allowed.has(k)) throw Error(`Unknown flag --${k} for ${cmd}. Usage: ${cmd} ${usage[cmd]}`);
  if (f.json !== undefined && f.json !== true) throw Error('--json is a boolean flag');
  if (f['dry-run'] !== undefined && f['dry-run'] !== true) throw Error('--dry-run is a boolean flag');
  if (Object.hasOwn(reads, cmd) && pos.length) throw Error(`Usage: ${cmd} takes no arguments`);
  return { cmd, pos, f };
}

async function log(db, actor, command, recordId, detail) {
  await db.query('insert into activity (actor, command, record_id, detail) values ($1,$2,$3,$4)', [actor, command, recordId, detail]);
}

// Match by code (case-insensitive, prefix) or by words in the name. Ambiguous -> list and fail.
async function findOne(db, table, q, label, nameCol = 'name', extra = '') {
  q = need(q, label);
  const exact = await db.query(`select * from ${table} where lower(code) = lower($1)${extra ? ` or ${extra} = lower($1)` : ''}`, [q]);
  if (exact.length === 1) return exact[0];
  const rows = await db.query(
    `select * from ${table} where lower(code) like lower($1) || '%' or lower(${nameCol}) like '%' || lower($1) || '%' order by code`, [q]);
  if (!rows.length) throw Error(`No matching ${label} for "${q}"`);
  if (rows.length > 1) throw Error(`Ambiguous: "${q}" matches ${rows.map((r) => `${r.code} (${truncate(r[nameCol], 40)})`).join('; ')}`);
  return rows[0];
}
const findSite = (db, q) => findOne(db, 'sites', q, 'site');
const findConsent = (db, q) => findOne(db, 'consents', q, 'consent', 'activity', 'lower(authority_ref)');
const findPoint = (db, q) => findOne(db, 'points', q, 'point');
const findIncident = (db, q) => findOne(db, 'incidents', q, 'incident', 'description');
const findInspection = (db, q) => findOne(db, 'inspections', q, 'inspection', 'findings');
const findNotice = (db, q) => findOne(db, 'notices', q, 'notice', 'requirement', 'lower(reference)');
const findPlan = (db, q) => findOne(db, 'plans', q, 'plan');
const findComplaint = (db, q) => findOne(db, 'complaints', q, 'complaint', 'detail');
// A condition by its code (RQY-LU1-5), or as the attention list writes it ("RQY-LU1 cond 5"), or by words in its summary.
async function findCondition(db, q) {
  q = need(q, 'condition');
  const m = q.match(/^(\S+)\s+(?:cond(?:ition)?\s+)?(\S+)$/i);
  if (m) {
    const rows = await db.query('select co.* from conditions co join consents c on c.id = co.consent_id where (lower(c.code) = lower($1) or lower(c.authority_ref) = lower($1)) and lower(co.number) = lower($2)', [m[1], m[2]]);
    if (rows.length === 1) return rows[0];
  }
  return findOne(db, 'conditions', q, 'condition', 'summary');
}
async function nextCode(db, table, prefix, width) {
  const rows = await db.query(`select code from ${table} where code like $1`, [`${prefix}%`]);
  const n = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0) + 1;
  return prefix + String(n).padStart(width, '0');
}

// ------------------------------------------------------------------ detail

async function siteDetail(db, q) {
  const s = await findSite(db, q);
  return {
    site: s,
    consents: await db.query(`select code, authority_ref, replace(kind, '_', ' ') as kind, expires_on, renew_by, status from consent_register where site = $1 order by code`, [s.code]),
    attention: await db.query('select severity, item, rule, detail, days from site_attention where site = $1 order by severity, days desc nulls last', [s.code]),
    due: await db.query('select consent, number, summary, next_due, days_overdue from condition_due where site = $1 and next_due <= current_date + 30 order by next_due', [s.code]),
    incidents: await db.query(`select code, replace(kind, '_', ' ') as kind, found_on, notified_on, status from incident_register where site = $1 order by found_on desc`, [s.code]),
    plans: await db.query('select code, name, version, last_reviewed_on, last_tested_on from plans where site_id = $1 order by code', [s.id]),
  };
}

async function consentDetail(db, q) {
  const c = await findConsent(db, q);
  const reg = (await db.query('select * from consent_register where id = $1', [c.id]))[0];
  delete reg.id;
  return {
    consent: { ...reg, notes: c.notes },
    conditions: await db.query('select number, kind, summary, owner, every_days, last_done, next_due, days_overdue from condition_due where consent = $1 order by length(number), number', [c.code]),
    limits: await db.query(`select p.code as point, l.parameter, l.unit, l.min_value::float as min, l.max_value::float as max, l.basis, co.number as condition
      from limits l join conditions co on co.id = l.condition_id join points p on p.id = l.point_id where co.consent_id = $1 order by p.code, l.parameter`, [c.id]),
    incidents: await db.query(`select code, replace(kind, '_', ' ') as kind, found_on, notified_on, regulator_ref, status from incident_register where consent = $1 order by found_on desc`, [c.code]),
    inspections: await db.query(`select code, inspected_on, replace(grade, '_', ' ') as grade, findings, actions_due, actions_done_on from inspections where consent_id = $1 order by inspected_on desc`, [c.id]),
    notices: await db.query(`select code, replace(kind, '_', ' ') as kind, issued_on, reference, comply_by, complied_on from notices where consent_id = $1 order by issued_on desc`, [c.id]),
  };
}

async function incidentDetail(db, q) {
  const i = await findIncident(db, q);
  const reg = (await db.query('select * from incident_register where id = $1', [i.id]))[0];
  delete reg.id;
  return {
    incident: { ...reg, notified_by: i.notified_by, cause: i.cause, closeout_note: i.closeout_note },
    reading: i.reading_id ? await db.query(`select point, taken_on, parameter, case when qualifier = '=' then '' else qualifier end || value::float as result, unit,
      coalesce('max ' || max_value::float, 'min ' || min_value::float) as limit_value, verdict from reading_check where reading_id = $1`, [i.reading_id]) : [],
    complaints: await db.query('select code, received_on, kind, location, detail from complaints where incident_id = $1 order by received_on', [i.id]),
    activity: await db.query('select created_at, actor, command, detail from activity where record_id = $1 order by id', [i.code]),
  };
}

// ------------------------------------------------------------------ writes

async function addConsent(db, f, actor) {
  const s = await findSite(db, f.site);
  const granted = date(f.granted, 'granted', { past: true });
  const expires = optDate(f.expires, 'expires');
  if (expires && expires <= granted) throw Error('--expires must be after --granted');
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'consents', `${s.code}-C`, 2);
  const row = (await db.query(`insert into consents (code, site_id, authority_ref, kind, activity, granted_on, commenced_on, lapse_on, expires_on, holder)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning code, authority_ref, kind, granted_on, expires_on`,
  [code, s.id, need(f.reference, 'reference'), one(f.kind, CONSENT_KINDS, 'kind'), need(f.activity, 'activity'), granted,
    optDate(f.commenced, 'commenced', { past: true }), optDate(f.lapse, 'lapse'), expires, f.holder ? need(f.holder, 'holder') : s.operator]))[0];
  await log(db, actor, 'add-consent', code, `${f.kind} ${f.reference} at ${s.code}`);
  const reg = (await db.query('select renew_by from consent_register where code = $1', [code]))[0];
  return { ...row, site: s.code, renew_by: reg.renew_by, next: `Add its conditions: npm run consent -- add-condition ${code} --number=1 ...` };
}

async function addCondition(db, q, f, actor) {
  const c = await findConsent(db, q);
  const kind = one(f.kind, CONDITION_KINDS, 'kind');
  const number = need(f.number, 'number');
  const every = f.every === undefined ? null : int(f.every, 'every', 1, 3660);
  const notifyWithin = f['notify-within'] === undefined ? null : int(f['notify-within'], 'notify-within', 0, 30);
  const wantsLimit = ['point', 'parameter', 'max', 'min', 'unit'].some((k) => f[k] !== undefined);
  if (kind === 'limit' && !wantsLimit) throw Error('A limit condition needs --point, --parameter, --unit and --max or --min');
  let point = null;
  if (wantsLimit) {
    point = await findPoint(db, f.point);
    if (f.max === undefined && f.min === undefined) throw Error('A limit needs --max or --min');
  }
  const exists = await db.query('select 1 from conditions where consent_id = $1 and lower(number) = lower($2)', [c.id, number]);
  if (exists.length) throw Error(`${c.code} already has a condition ${number}`);
  await db.exec('BEGIN');
  try {
    const row = (await db.query(`insert into conditions (code, consent_id, number, kind, summary, wording, owner, every_days, first_due, notify_within_days)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning code, number, kind, summary, every_days, first_due`,
    [`${c.code}-${number}`.toUpperCase(), c.id, number, kind, need(f.summary, 'summary'), f.wording || null, f.owner || null, every,
      optDate(f['first-due'], 'first-due'), notifyWithin]))[0];
    if (point) {
      await db.query('insert into limits (condition_id, point_id, parameter, unit, min_value, max_value) select id, $2, $3, $4, $5, $6 from conditions where code = $1',
        [row.code, point.id, paramCode(need(f.parameter, 'parameter')), need(f.unit, 'unit'), f.min === undefined ? null : num(f.min, 'min'), f.max === undefined ? null : num(f.max, 'max')]);
    }
    await log(db, actor, 'add-condition', row.code, `${kind}: ${f.summary}`);
    await db.exec('COMMIT');
    return { ...row, consent: c.code, limit: point ? `${paramCode(f.parameter)} at ${point.code}` : 'none' };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function met(db, q, f, actor) {
  const co = await findCondition(db, q);
  if (!co.active) throw Error(`${co.code} is no longer active`);
  const on = date(f.on, 'on', { past: true });
  await db.query('insert into evidence (condition_id, done_on, done_by, reference, note) values ($1,$2,$3,$4,$5)',
    [co.id, on, need(f.by, 'by'), f.reference || null, f.note || null]);
  await log(db, actor, 'met', co.code, `met ${on} by ${f.by}${f.reference ? `, ref ${f.reference}` : ''}`);
  const d = (await db.query('select next_due from condition_due where condition_id = $1', [co.id]))[0];
  return { condition: co.code, summary: co.summary, done_on: on, next_due: d?.next_due || 'not recurring' };
}

// Recording a reading over a consent limit opens an incident in the same step,
// so a breach can never sit in the readings with nobody owning it.
async function recordReading(db, f, actor) {
  const p = await findPoint(db, f.point);
  const parameter = paramCode(need(f.parameter, 'parameter'));
  const limit = (await db.query('select l.*, co.code as condition, co.consent_id, co.notify_within_days from limits l join conditions co on co.id = l.condition_id where l.point_id = $1 and l.parameter = $2', [p.id, parameter]))[0];
  const unit = f.unit ? need(f.unit, 'unit') : limit?.unit;
  if (!unit) throw Error(`--unit is required: ${p.code} has no consent limit for ${parameter}`);
  if (limit && unit !== limit.unit) throw Error(`--unit ${unit} does not match the consent limit's unit (${limit.unit}); convert the result first`);
  const qualifier = one(f.qualifier || '=', ['<', '=', '>'], 'qualifier');
  const value = num(f.value, 'value', { min: -1e9 });
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  const source = one(f.source || (parameter === 'VOLUME' ? 'meter' : 'lab'), SOURCES, 'source');
  const dup = await db.query('select 1 from readings where point_id = $1 and taken_on = $2 and parameter = $3', [p.id, on, parameter]);
  if (dup.length) throw Error(`${p.code} already has a ${parameter} reading on ${on}. Readings are never changed: record the correction with a note in the incident.`);
  await db.exec('BEGIN');
  try {
    const r = (await db.query('insert into readings (point_id, taken_on, parameter, qualifier, value, unit, source, lab_ref) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [p.id, on, parameter, qualifier, value, unit, source, f['lab-ref'] || null]))[0];
    const check = (await db.query('select * from reading_check where reading_id = $1', [r.id]))[0];
    let incident = null;
    if (['over limit', 'under minimum'].includes(check.verdict)) {
      incident = await nextCode(db, 'incidents', 'NC-', 4);
      await db.query(`insert into incidents (code, consent_id, condition_id, reading_id, kind, found_on, description) values ($1,$2,(select id from conditions where code = $3),$4,'exceedance',$5,$6)`,
        [incident, limit.consent_id, limit.condition, r.id, today(), `${parameter} ${shown(qualifier, value)} ${unit} at ${p.name} on ${on} against ${limit.max_value !== null ? `a limit of ${Number(limit.max_value)}` : `a minimum of ${Number(limit.min_value)}`} (condition ${limit.condition})`]);
      await log(db, actor, 'raise', incident, `opened automatically from ${p.code} ${parameter} ${on}`);
    }
    await log(db, actor, 'reading', p.code, `${parameter} ${shown(qualifier, value)} ${unit} on ${on}: ${check.verdict}`);
    await db.exec('COMMIT');
    let next;
    if (incident) {
      const ir = (await db.query('select regulator, notify_by from incident_register where code = $1', [incident]))[0];
      next = `Tell ${ir.regulator} by ${ir.notify_by} (then: notify ${incident}), find the cause, and record what you did about it.`;
    }
    return { point: p.code, parameter, taken_on: on, result: `${shown(qualifier, value)} ${unit}`, verdict: check.verdict,
      ...(incident ? { incident_opened: incident, next } : {}) };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function raise(db, f, actor) {
  const c = await findConsent(db, f.consent);
  const co = f.condition ? await findCondition(db, f.condition) : null;
  if (co && co.consent_id !== c.id) throw Error(`${co.code} is not a condition of ${c.code}`);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'incidents', 'NC-', 4);
  const row = (await db.query(`insert into incidents (code, consent_id, condition_id, kind, found_on, description) values ($1,$2,$3,$4,$5,$6) returning code, kind, found_on`,
    [code, c.id, co?.id || null, one(f.kind, INCIDENT_KINDS, 'kind'), f.found ? date(f.found, 'found', { past: true }) : today(), need(f.description, 'description')]))[0];
  await log(db, actor, 'raise', code, `${f.kind} on ${c.code}`);
  const ir = (await db.query('select regulator, notify_by from incident_register where code = $1', [code]))[0];
  return { ...row, consent: c.code, tell_regulator: NOTIFIABLE.includes(f.kind) ? `yes: ${ir.regulator} by ${ir.notify_by}` : 'check the consent; not required by this kind on its own' };
}

async function notify(db, q, f, actor) {
  const i = await findIncident(db, q);
  if (i.notified_on) throw Error(`${i.code} was notified on ${i.notified_on} (${i.regulator_ref})`);
  const on = date(f.on, 'on', { past: true });
  if (on < i.found_on) throw Error(`--on ${on} is before the incident was found (${i.found_on})`);
  await db.query('update incidents set notified_on = $2, notified_by = $3, regulator_ref = $4 where id = $1', [i.id, on, need(f.by, 'by'), need(f.reference, 'reference')]);
  await log(db, actor, 'notify', i.code, `regulator told ${on} by ${f.by}, ref ${f.reference}`);
  const ir = (await db.query('select days_to_notify, notify_within_days from incident_register where id = $1', [i.id]))[0];
  return { incident: i.code, notified_on: on, reference: f.reference, days_after_found: ir.days_to_notify, late: ir.days_to_notify > ir.notify_within_days };
}

async function closeIncident(db, q, f, actor) {
  const i = await findIncident(db, q);
  if (i.closed_on) throw Error(`${i.code} was closed on ${i.closed_on}`);
  if (NOTIFIABLE.includes(i.kind) && !i.notified_on) throw Error(`${i.code} cannot close: the regulator has not been told (notify ${i.code})`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  if (on < i.found_on) throw Error(`--on ${on} is before the incident was found`);
  await db.query('update incidents set cause = $2, corrective_action = $3, closeout_note = $4, closed_on = $5 where id = $1',
    [i.id, need(f.cause, 'cause'), need(f['corrective-action'], 'corrective-action'), need(f.note, 'note'), on]);
  await log(db, actor, 'close-incident', i.code, f.note);
  return { incident: i.code, status: 'closed', closed_on: on };
}

async function inspection(db, f, actor) {
  const c = await findConsent(db, f.consent);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'inspections', 'IN-', 3);
  const grade = one(f.grade, GRADES, 'grade');
  const due = optDate(f['actions-due'], 'actions-due');
  if (['moderate', 'significant'].includes(grade) && !due) throw Error(`A ${grade} grade needs --actions-due: the date the council expects the fixes`);
  const row = (await db.query(`insert into inspections (code, consent_id, inspected_on, officer, grade, findings, actions_due) values ($1,$2,$3,$4,$5,$6,$7)
    returning code, inspected_on, grade, actions_due`, [code, c.id, f.on ? date(f.on, 'on', { past: true }) : today(), need(f.officer, 'officer'), grade, f.findings || null, due]))[0];
  await log(db, actor, 'inspection', code, `${grade} on ${c.code}${f.findings ? `: ${f.findings}` : ''}`);
  return { ...row, consent: c.code };
}

async function inspectionDone(db, q, f, actor) {
  const i = await findInspection(db, q);
  if (!i.actions_due) throw Error(`${i.code} has no actions to close`);
  if (i.actions_done_on) throw Error(`${i.code} actions were done on ${i.actions_done_on}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update inspections set actions_done_on = $2 where id = $1', [i.id, on]);
  await log(db, actor, 'inspection-done', i.code, `actions done ${on}`);
  return { inspection: i.code, actions_done_on: on, late: on > i.actions_due };
}

async function notice(db, f, actor) {
  const s = await findSite(db, f.site);
  const c = f.consent ? await findConsent(db, f.consent) : null;
  if (c && c.site_id !== s.id) throw Error(`${c.code} is not at ${s.code}`);
  const kind = one(f.kind, NOTICE_KINDS, 'kind');
  const comply = optDate(f['comply-by'], 'comply-by');
  if (['abatement', 'enforcement_order', 'clean_up_notice'].includes(kind) && !comply) throw Error(`An ${kind.replace(/_/g, ' ')} needs --comply-by: the date on the notice`);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'notices', kind === 'infringement' || kind === 'penalty_notice' ? 'INF-' : 'AN-', 3);
  const row = (await db.query(`insert into notices (code, consent_id, site_id, kind, issued_on, issued_by, reference, requirement, comply_by, amount)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning code, kind, issued_on, comply_by`,
  [code, c?.id || null, s.id, kind, f.on ? date(f.on, 'on', { past: true }) : today(), need(f['issued-by'], 'issued-by'), need(f.reference, 'reference'),
    need(f.requirement, 'requirement'), comply, f.amount === undefined ? null : num(f.amount, 'amount')]))[0];
  await log(db, actor, 'notice', code, `${kind} ${f.reference} from ${f['issued-by']}`);
  return { ...row, site: s.code, next: comply ? `Do what it requires by ${comply}, then: comply ${code} --evidence="..."` : 'Record payment or response with: comply' };
}

async function comply(db, q, f, actor) {
  const n = await findNotice(db, q);
  if (n.complied_on) throw Error(`${n.code} was complied with on ${n.complied_on}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  if (on < n.issued_on) throw Error(`--on ${on} is before the notice was issued`);
  const evidence = need(f.evidence, 'evidence');
  await db.query('update notices set complied_on = $2 where id = $1', [n.id, on]);
  await log(db, actor, 'comply', n.code, `complied ${on}: ${evidence}`);
  return { notice: n.code, complied_on: on, late: n.comply_by ? on > n.comply_by : false };
}

async function renewal(db, q, f, actor) {
  const c = await findConsent(db, q);
  if (!c.expires_on) throw Error(`${c.code} has no expiry date; there is nothing to renew`);
  if (c.renewal_lodged_on) throw Error(`${c.code} renewal was lodged on ${c.renewal_lodged_on} (${c.renewal_ref})`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update consents set renewal_lodged_on = $2, renewal_ref = $3 where id = $1', [c.id, on, need(f.reference, 'reference')]);
  await log(db, actor, 'renewal', c.code, `renewal lodged ${on}, ref ${f.reference}`);
  const renewBy = (await db.query('select renew_by from consent_register where id = $1', [c.id]))[0].renew_by;
  return { consent: c.code, renewal_lodged_on: on, renew_by: renewBy, in_time: on <= renewBy,
    note: on <= renewBy ? 'Lodged at least six months before expiry: the activity can continue while it is decided (RMA s124).'
      : 'Lodged inside six months of expiry: the council decides whether the activity can continue (RMA s124). Ask them in writing.' };
}

async function commenced(db, q, f, actor) {
  const c = await findConsent(db, q);
  if (c.commenced_on) throw Error(`${c.code} was given effect on ${c.commenced_on}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  if (on < c.granted_on) throw Error(`--on ${on} is before the consent was granted`);
  await db.query('update consents set commenced_on = $2 where id = $1', [c.id, on]);
  await log(db, actor, 'commenced', c.code, `given effect ${on}`);
  return { consent: c.code, commenced_on: on };
}

async function verifyMeter(db, q, f, actor) {
  const p = await findPoint(db, q);
  if (p.kind !== 'water_meter') throw Error(`${p.code} is not a water meter`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  const by = need(f.by, 'by');
  await db.query('update points set meter_verified_on = $2 where id = $1', [p.id, on]);
  await log(db, actor, 'verify-meter', p.code, `verified ${on} by ${by}`);
  return { point: p.code, meter_verified_on: on, next_due: addDays(on, 365 * 5) };
}

async function reviewPlan(db, q, f, actor) {
  const p = await findPlan(db, q);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update plans set last_reviewed_on = $2, version = coalesce($3, version) where id = $1', [p.id, on, f.version ? need(f.version, 'version') : null]);
  await log(db, actor, 'review-plan', p.code, `reviewed ${on}${f.version ? `, now version ${f.version}` : ''}`);
  return { plan: p.code, last_reviewed_on: on, version: f.version || p.version };
}

async function testPlan(db, q, f, actor) {
  const p = await findPlan(db, q);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update plans set last_tested_on = $2 where id = $1', [p.id, on]);
  await log(db, actor, 'test-plan', p.code, `tested ${on}`);
  return { plan: p.code, last_tested_on: on, next_test_by: addDays(on, 365) };
}

async function logComplaint(db, f, actor) {
  const s = await findSite(db, f.site);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'complaints', 'CP-', 3);
  const row = (await db.query(`insert into complaints (code, site_id, received_on, kind, location, detail) values ($1,$2,$3,$4,$5,$6) returning code, received_on, kind`,
    [code, s.id, f.on ? date(f.on, 'on', { past: true }) : today(), one(f.kind, COMPLAINT_KINDS, 'kind'), f.location || null, need(f.detail, 'detail')]))[0];
  await log(db, actor, 'log-complaint', code, `${f.kind} at ${s.code}`);
  return { ...row, site: s.code, next: 'Check the monitoring for that day, answer the complainant, and raise an incident if a condition was breached.' };
}

async function respond(db, q, f, actor) {
  const c = await findComplaint(db, q);
  if (c.closed_on) throw Error(`${c.code} was closed on ${c.closed_on}`);
  const i = f.incident ? await findIncident(db, f.incident) : null;
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  if (on < c.received_on) throw Error(`--on ${on} is before the complaint came in`);
  await db.query('update complaints set response = $2, responded_on = $3, incident_id = coalesce($4, incident_id) where id = $1', [c.id, need(f.response, 'response'), on, i?.id || null]);
  await log(db, actor, 'respond', c.code, f.response);
  return { complaint: c.code, responded_on: on, incident: i?.code || null };
}

async function closeComplaint(db, q, f, actor) {
  const c = await findComplaint(db, q);
  if (c.closed_on) throw Error(`${c.code} was closed on ${c.closed_on}`);
  if (!c.responded_on) throw Error(`${c.code} has no response recorded (respond ${c.code} --response="...")`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update complaints set closed_on = $2 where id = $1', [c.id, on]);
  await log(db, actor, 'close-complaint', c.code, `closed ${on}`);
  return { complaint: c.code, closed_on: on };
}

// ------------------------------------------------------------------ import / export

const FREQUENCY = { daily: 1, weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, '3 monthly': 91, 'three monthly': 91, '6 monthly': 182,
  'six monthly': 182, 'half yearly': 182, annually: 365, annual: 365, yearly: 365, '2 yearly': 730, 'two yearly': 730, '5 yearly': 1826 };
const ONCE = ['', 'once', 'one-off', 'one off', 'ongoing', 'as required', 'n/a'];
function normDate(v, label) {
  v = String(v || '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return date(`${m[1]}-${m[2]}-${m[3]}`, label);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // NZ and AU exports: day first
  if (m) return date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, label);
  throw Error(`${label}: "${v}" is not a date this importer reads (use YYYY-MM-DD or DD/MM/YYYY)`);
}
function frequency(v) {
  const s = String(v || '').trim().toLowerCase();
  if (ONCE.includes(s)) return null;
  if (Object.hasOwn(FREQUENCY, s)) return FREQUENCY[s];
  const m = s.match(/^every\s+(\d+)\s+days?$|^(\d+)$/);
  if (m) return Number(m[1] || m[2]);
  throw Error(`frequency "${v}" is not one this importer reads (daily, weekly, monthly, quarterly, six monthly, annually, a number of days, or one-off)`);
}
function kindOf(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return 'general';
  const k = s.replace(/[\s-]+/g, '_').replace(/s$/, '');
  if (CONDITION_KINDS.includes(k)) return k;
  if (/plan/.test(s)) return 'management_plan';
  if (/report/.test(s)) return 'reporting';
  if (/monitor|sampl/.test(s)) return 'monitoring';
  if (/limit|standard/.test(s)) return 'limit';
  if (/notif/.test(s)) return 'notification';
  return 'general';
}

// CS-VUE exports are set up per client. The importer reads the common column names
// of a conditions register and a monitoring results file, reports every row it
// cannot map, and imports nothing while any row is wrong.
async function importCsVue(db, f, actor) {
  if (!f.conditions && !f.readings) throw Error('Give --conditions=<file.csv>, --readings=<file.csv> or both');
  const read = (file) => {
    const text = fs.readFileSync(path.resolve(need(file, 'file')), 'utf8');
    return { text, rows: parseCsv(text) };
  };
  const problems = [];
  const consents = await db.query('select id, code, lower(authority_ref) as ref from consents');
  const byRef = (v) => consents.find((c) => c.ref === String(v).trim().toLowerCase() || c.code.toLowerCase() === String(v).trim().toLowerCase());
  const existing = new Set((await db.query('select consent_id || $1 || lower(number) as k from conditions', ['|'])).map((r) => r.k));
  const conds = [];
  let cText = '';
  let cRows = [];
  if (f.conditions) {
    ({ text: cText, rows: cRows } = read(f.conditions));
    const seen = new Set();
    cRows.forEach((row, n) => {
      const line = n + 2;
      try {
        const ref = pick(row, 'consent number', 'consent', 'authorisation', 'authorisation number', 'permit number', 'licence number', 'consent reference');
        const c = byRef(ref);
        if (!c) throw Error(`no consent "${ref}" here (add it first with add-consent)`);
        const number = String(pick(row, 'condition number', 'condition no', 'condition', 'number')).trim();
        if (!number) throw Error('no condition number');
        const summary = String(pick(row, 'summary', 'description', 'condition summary', 'title', 'requirement')).trim();
        if (!summary) throw Error('no summary or description');
        const key = `${c.id}|${number.toLowerCase()}`;
        if (seen.has(key)) throw Error(`condition ${number} of ${c.code} is listed twice`);
        seen.add(key);
        conds.push({ c, number, summary, key, kind: kindOf(pick(row, 'type', 'category', 'condition type')), owner: pick(row, 'owner', 'responsible', 'responsible person', 'assigned to') || null,
          wording: pick(row, 'wording', 'condition text', 'full text') || null, every: frequency(pick(row, 'frequency', 'recurrence', 'repeat')),
          due: normDate(pick(row, 'next due', 'due date', 'due'), `conditions row ${line} due date`) });
      } catch (e) { problems.push(`conditions row ${line}: ${e.message}`); }
    });
  }
  const points = await db.query('select id, code, lower(name) as name from points');
  const reads = [];
  let rText = '';
  let rRows = [];
  if (f.readings) {
    ({ text: rText, rows: rRows } = read(f.readings));
    rRows.forEach((row, n) => {
      const line = n + 2;
      try {
        const pv = String(pick(row, 'monitoring point', 'site', 'sample point', 'location', 'point')).trim().toLowerCase();
        const p = points.find((x) => x.code.toLowerCase() === pv || x.name === pv);
        if (!p) throw Error(`no monitoring point "${pv}"`);
        const parameter = paramCode(pick(row, 'parameter', 'determinand', 'analyte', 'measure'));
        if (!parameter) throw Error('no parameter');
        const m = String(pick(row, 'result', 'value', 'reading')).trim().match(/^([<>])?\s*(-?\d+(?:\.\d+)?)$/);
        if (!m) throw Error(`result "${pick(row, 'result', 'value', 'reading')}" is not a number`);
        const unit = String(pick(row, 'units', 'unit')).trim();
        if (!unit) throw Error('no units');
        const day = normDate(pick(row, 'date', 'sample date', 'date sampled', 'reading date'), `readings row ${line} date`);
        if (!day) throw Error('no date');
        reads.push({ p, parameter, qualifier: m[1] || '=', value: Number(m[2]), unit, day, lab: pick(row, 'lab reference', 'lab ref', 'lab job') || null });
      } catch (e) { problems.push(`readings row ${line}: ${e.message}`); }
    });
  }
  const freshConds = conds.filter((c) => !existing.has(c.key));
  const summary = { condition_rows: cRows.length, conditions_new: freshConds.length, conditions_already_here: conds.length - freshConds.length,
    reading_rows: rRows.length, problems, dry_run: Boolean(f['dry-run']) };
  if (problems.length || f['dry-run']) {
    if (problems.length && !f['dry-run']) throw Error(`Nothing imported. Fix these first:\n  ${problems.join('\n  ')}`);
    return summary;
  }
  await db.exec('BEGIN');
  try {
    for (const c of freshConds) {
      await db.query(`insert into conditions (code, consent_id, number, kind, summary, wording, owner, every_days, first_due) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [`${c.c.code}-${c.number}`.toUpperCase(), c.c.id, c.number, c.kind, c.summary, c.wording, c.owner, c.every, c.due]);
    }
    let readingsIn = 0;
    const breaches = [];
    for (const r of reads) {
      const ins = await db.query(`insert into readings (point_id, taken_on, parameter, qualifier, value, unit, source, lab_ref) values ($1,$2,$3,$4,$5,$6,'import',$7)
        on conflict (point_id, taken_on, parameter) do nothing returning id`, [r.p.id, r.day, r.parameter, r.qualifier, r.value, r.unit, r.lab]);
      if (!ins.length) continue;
      readingsIn++;
      const chk = (await db.query('select verdict from reading_check where reading_id = $1', [ins[0].id]))[0];
      if (['over limit', 'under minimum'].includes(chk.verdict)) breaches.push(`${r.p.code} ${r.parameter} ${r.day}`);
    }
    for (const [file, text, rows, n] of [[f.conditions, cText, cRows, freshConds.length], [f.readings, rText, rRows, readingsIn]]) {
      if (!file) continue;
      await db.query('insert into imports (source, file_name, file_sha256, rows_read, rows_imported, actor) values ($1,$2,$3,$4,$5,$6)',
        ['cs-vue', path.basename(file), createHash('sha256').update(text).digest('hex'), rows.length, n, actor]);
    }
    await log(db, actor, 'import', null, `cs-vue: ${freshConds.length} conditions, ${readingsIn} readings`);
    await db.exec('COMMIT');
    // Imported breaches are not raised as incidents: the old system may already hold them.
    // They show in attention and compliance until someone raises or reviews them.
    return { ...summary, readings_new: readingsIn, readings_already_here: reads.length - readingsIn, breaches_to_review: breaches };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function exportAll(db, f) {
  const out = path.resolve(need(f.out, 'out'));
  if (fs.existsSync(out)) throw Error(`${out} already exists; choose a new file name`);
  const data = { exported_at: new Date().toISOString() };
  for (const t of TABLES) data[t] = await db.query(`select * from ${t}`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2), { mode: 0o600 });
  return { file: out, tables: Object.fromEntries(TABLES.map((t) => [t, data[t].length])) };
}

// ------------------------------------------------------------------ drafts

function draftsDir() {
  const dir = path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const md = (rows) => {
  if (!rows.length) return '_None._\n';
  const cols = Object.keys(rows[0]);
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  return `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n')}\n`;
};
const consentRow = async (db, code) => (await db.query('select r.*, s.name as site_name, s.operator from consent_register r join sites s on s.code = r.site where r.code = $1', [code]))[0];

async function draftNotification(db, q) {
  const d = await incidentDetail(db, q);
  const i = d.incident;
  const c = await consentRow(db, i.consent);
  const body = `# Notification to ${i.regulator}: ${i.code}

| Field | Value |
|---|---|
| Consent holder | ${c.holder} |
| Consent or licence | ${c.authority_ref} (${c.kind.replace(/_/g, ' ')}) |
| Site | ${c.site_name} |
| Condition | ${i.condition || 'not tied to one condition'} |
| What | ${i.kind.replace(/_/g, ' ')} |
| Found | ${i.found_on} |
| To be told by | ${i.notify_by} |

## What happened
${i.description}

## The result
${d.reading.length ? md(d.reading) : 'Not a monitoring result.\n'}
## What we have done and will do
${i.corrective_action || '[Immediate steps taken, the cause as far as it is known, and what will stop it happening again.]'}

## Contact
${c.operator}. [Name, phone.]

_Draft prepared ${today()} from the incident record. Check it, then send it the way your consent or licence asks (email, portal or phone first). Record it with: npm run consent -- notify ${i.code} --on=<date> --by=<name> --reference=<their reference>_
`;
  const file = path.join(draftsDir(), `notification-${i.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, incident: i.code, regulator: i.regulator, notify_by: i.notify_by };
}

async function annualReport(db, q, f) {
  const c = await findConsent(db, q);
  const year = f.year ? Number(f.year) : new Date().getUTCFullYear() - 1;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw Error('--year must be a four-digit year');
  // Monitoring years in consents commonly run 1 July to 30 June; the report covers the year ending 30 June <year>.
  const from = `${year - 1}-07-01`;
  const to = `${year}-06-30`;
  const r = await consentRow(db, c.code);
  const conds = await db.query(`select co.number, co.summary, count(e.id)::int as times_met, max(e.done_on) as last_met
    from conditions co left join evidence e on e.condition_id = co.id and e.done_on between $2 and $3 where co.consent_id = $1 and co.active
    group by co.number, co.summary order by length(co.number), co.number`, [c.id, from, to]);
  const results = await db.query(`select point, parameter, count(*)::int as results, min(value)::float as lowest, max(value)::float as highest,
      max(coalesce(max_value, min_value))::float as limit_value, count(*) filter (where verdict in ('over limit','under minimum'))::int as breaches
    from reading_check where consent = $1 and taken_on between $2 and $3 group by point, parameter order by point, parameter`, [c.code, from, to]);
  const incidents = await db.query(`select code, kind, found_on, notified_on, regulator_ref, status from incident_register where consent = $1 and found_on between $2 and $3 order by found_on`, [c.code, from, to]);
  const complaints = await db.query(`select kind, count(*)::int as complaints from complaints where site_id = $1 and received_on between $2 and $3 group by kind order by kind`, [c.site_id, from, to]);
  const body = `# Annual compliance report, year ending 30 June ${year}: ${r.authority_ref}

| Field | Value |
|---|---|
| Consent holder | ${r.holder} |
| Site | ${r.site_name} |
| Consent or licence | ${r.authority_ref}, ${r.kind.replace(/_/g, ' ')} |
| Activity | ${r.activity} |
| Expires | ${r.expires_on || 'no expiry'} |

## Conditions
${md(conds)}
## Monitoring results
${md(results)}
## Non-compliance and what the regulator was told
${md(incidents)}
## Complaints at the site
${md(complaints)}
_Draft prepared ${today()} from the records for ${from} to ${to}. Your consent sets the date and contents of this report; check the reporting condition before you lodge it._
`;
  const file = path.join(draftsDir(), `annual-report-${c.code.toLowerCase()}-${year}.md`);
  fs.writeFileSync(file, body);
  return { file, consent: c.code, year, results: results.reduce((n, x) => n + x.results, 0), incidents: incidents.length };
}

async function draftRenewal(db, q) {
  const d = await consentDetail(db, q);
  const c = d.consent;
  if (!c.expires_on) throw Error(`${c.code} has no expiry date; there is nothing to renew`);
  const breaches = await db.query(`select point, parameter, count(*)::int as breaches, max(taken_on) as latest from reading_check
    where consent = $1 and verdict in ('over limit','under minimum') and taken_on >= current_date - 1825 group by point, parameter order by point`, [c.code]);
  const body = `# Renewal pack: ${c.authority_ref} (${c.code})

| Field | Value |
|---|---|
| Activity | ${c.activity} |
| Expires | ${c.expires_on} |
| Lodge by (six months before expiry) | ${c.renew_by} |
| Days left to lodge | ${c.days_to_renew_by} |
| Renewal lodged | ${c.renewal_lodged_on ? `${c.renewal_lodged_on}, ${c.renewal_ref}` : 'not yet'} |

${c.days_to_renew_by < 0 ? `**The six-month date has passed.** An application lodged now is inside the window where the council decides whether the activity can continue until the new consent is decided (RMA s124). Ask the council in writing as you lodge.\n` : `Lodge by ${c.renew_by} and the activity can continue on the current consent while the new one is decided (RMA s124).\n`}
## The current conditions
${md(d.conditions.map(({ number, kind, summary, last_done }) => ({ number, kind, summary, last_done })))}
## Compliance history to put in front of the council
### Inspections
${md(d.inspections)}
### Incidents
${md(d.incidents)}
### Breaches of limits, last five years
${md(breaches)}
### Notices
${md(d.notices)}
## Checklist
- [ ] Book a pre-application meeting with the council
- [ ] Assessment of environmental effects updated for the new term
- [ ] Monitoring summary for the current term (the tables above)
- [ ] Conditions you want changed, and why
- [ ] Affected parties and iwi engagement recorded
- [ ] Application fee and deposit

_Draft prepared ${today()} from the records. Nothing has been lodged. Record it once lodged with: npm run consent -- renewal ${c.code} --reference=<council reference>_
`;
  const file = path.join(draftsDir(), `renewal-${c.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, consent: c.code, renew_by: c.renew_by, days_to_renew_by: c.days_to_renew_by };
}

async function draftResponse(db, q) {
  const n = await findNotice(db, q);
  const s = (await db.query('select * from sites where id = $1', [n.site_id]))[0];
  const c = n.consent_id ? (await db.query('select code, authority_ref from consents where id = $1', [n.consent_id]))[0] : null;
  const steps = await db.query('select created_at, actor, command, detail from activity where record_id = $1 order by id', [n.code]);
  const body = `# Response to ${n.kind.replace(/_/g, ' ')} notice ${n.reference}

To: ${n.issued_by}
From: ${s.operator}
Site: ${s.name}${c ? `, consent ${c.authority_ref}` : ''}

## The notice
Issued ${n.issued_on}. It requires: ${n.requirement}.${n.comply_by ? ` Comply by ${n.comply_by}.` : ''}

## What we have done
[Each step taken, with dates and photos or test results attached.]

## What we will do to stop it happening again
[The change to the site, the plan or the monitoring.]

## Record so far
${md(steps)}
_Draft prepared ${today()}. Check every line before it goes. Record compliance with: npm run consent -- comply ${n.code} --evidence="..."_
`;
  const file = path.join(draftsDir(), `response-${n.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, notice: n.code, comply_by: n.comply_by };
}

async function weeklyReview(db) {
  const att = await db.query(reads.attention.sql);
  const due = await db.query(`select site, consent, number, summary, owner, next_due, days_overdue from condition_due where next_due <= current_date + 14 order by next_due`);
  const open = await db.query(`select code, site, consent, replace(kind, '_', ' ') as kind, found_on, notified_on, days_open from incident_register where status = 'open' order by found_on`);
  const urgent = att.filter((a) => a.severity === 1);
  const body = `# Consent compliance: weekly review, ${today()}

${urgent.length ? `**${urgent.length} item(s) touch a legal duty or the right to operate and come first:** ${urgent.map((u) => `${u.item} at ${u.site} (${u.rule})`).join('; ')}.` : '**Nothing this week touches a legal duty or the right to operate.**'}

## Needs attention
${md(att)}
## Open incidents
${md(open)}
## Conditions due in the next 14 days
${md(due)}
_Draft from three commands: attention, incidents, due. Read before it goes to the operations meeting._
`;
  const file = path.join(draftsDir(), `weekly-review-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, needs_attention: att.length, urgent: urgent.length, open_incidents: open.length, due_14_days: due.length };
}

// ------------------------------------------------------------------ run

export async function run(db, args) {
  const { cmd, pos, f } = parse(args);
  let actor = null;
  if (mutating.has(cmd)) actor = need(f.actor, 'actor');
  if (Object.hasOwn(reads, cmd)) {
    if (cmd === 'compliance') {
      const out = [];
      for (const r of complianceRules) for (const row of await db.query(r.sql)) out.push({ rule: r.rule, code: row.code, finding: row.finding });
      return out.sort((a, b) => a.code.localeCompare(b.code) || a.rule.localeCompare(b.rule));
    }
    return db.query(reads[cmd].sql);
  }
  const target = pos.join(' ');
  switch (cmd) {
    case 'help': return Object.entries(usage).map(([command, a]) => ({ command, args: a, about: reads[command]?.about || '' }));
    case 'site': return siteDetail(db, target);
    case 'consent': return consentDetail(db, target);
    case 'incident': return incidentDetail(db, target);
    case 'add-consent': return addConsent(db, f, actor);
    case 'add-condition': return addCondition(db, target, f, actor);
    case 'met': return met(db, target, f, actor);
    case 'reading': return recordReading(db, f, actor);
    case 'raise': return raise(db, f, actor);
    case 'notify': return notify(db, target, f, actor);
    case 'close-incident': return closeIncident(db, target, f, actor);
    case 'inspection': return inspection(db, f, actor);
    case 'inspection-done': return inspectionDone(db, target, f, actor);
    case 'notice': return notice(db, f, actor);
    case 'comply': return comply(db, target, f, actor);
    case 'renewal': return renewal(db, target, f, actor);
    case 'commenced': return commenced(db, target, f, actor);
    case 'verify-meter': return verifyMeter(db, target, f, actor);
    case 'review-plan': return reviewPlan(db, target, f, actor);
    case 'test-plan': return testPlan(db, target, f, actor);
    case 'log-complaint': return logComplaint(db, f, actor);
    case 'respond': return respond(db, target, f, actor);
    case 'close-complaint': return closeComplaint(db, target, f, actor);
    case 'import':
      if (pos[0] !== 'cs-vue' || pos.length > 1) throw Error(`Usage: import ${usage.import}`);
      return importCsVue(db, f, actor);
    case 'export': return exportAll(db, f);
    case 'draft-notification': return draftNotification(db, target);
    case 'annual-report': return annualReport(db, target, f);
    case 'draft-renewal': return draftRenewal(db, target);
    case 'draft-response': return draftResponse(db, target);
    case 'weekly-review': return weeklyReview(db);
    default: throw Error(`Unknown command ${cmd}`);
  }
}

const WIDE = ['detail', 'description', 'finding', 'about', 'args', 'summary', 'requirement', 'findings', 'activity', 'note'];
function print(cmd, result) {
  if (Array.isArray(result)) {
    if (!result.length) { console.log('  (none)'); return; }
    const cols = Object.keys(result[0]).map((key) => ({ key, label: key, width: WIDE.includes(key) ? 48 : undefined,
      align: typeof result[0][key] === 'number' ? 'right' : 'left' }));
    console.log(textTable(result, cols));
    return;
  }
  if (['site', 'consent', 'incident'].includes(cmd)) {
    const head = result[cmd];
    console.log(heading(`${head.code}  ${head.name || head.activity || head.description || ''}`));
    for (const [k, v] of Object.entries(head)) if (v !== null && v !== undefined && !['code', 'name', 'activity', 'description', 'id', 'created_at', 'updated_at'].includes(k)) console.log(`  ${k.padEnd(22)}${v}`);
    for (const [label, rows] of Object.entries(result)) {
      if (!Array.isArray(rows)) continue;
      console.log(heading(label));
      print('', rows);
    }
    return;
  }
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.padEnd(26)}${Array.isArray(v) ? (v.length ? '\n    ' + v.join('\n    ') : 'none') : typeof v === 'object' && v ? JSON.stringify(v) : v}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let db;
  try {
    db = await getDb();
    const result = await run(db, args);
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else print(args.find((a) => !a.startsWith('--')) || 'help', result);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
