// npm test: a temporary database, migrate, seed twice, then every command and every gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, reads, usage } from './consent.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const db = await getDb();
const exercised = new Set();
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const call = async (args) => { exercised.add(args[0]); return run(db, args); };
const fail = async (args, re) => { exercised.add(args[0]); await assert.rejects(() => run(db, args), re); checks++; };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const actor = '--actor=Tester';

try {
  ok((await migrate(db)).ran.length === 1, 'migration applies');
  ok((await migrate(db)).ran.length === 0, 'migration is idempotent');
  await seed(db);
  await seed(db);
  ok((await db.query('select * from evidence')).length === 11, 'seed is idempotent');
  ok((await db.query('select * from readings')).length === 137, 'seed readings');

  // Every read works in both shapes.
  for (const name of Object.keys(reads)) ok(Array.isArray(await call([name, '--json'])), `${name} returns rows`);
  ok((await call(['help'])).length === Object.keys(usage).length, 'help lists every command');

  // The attention list finds what the seed planted.
  const att = await call(['attention']);
  const has = (item, rule) => att.some((r) => (r.item === item || r.item.startsWith(`${item} `)) && r.rule === rule);
  ok(has('RQY-BORE1 VOLUME', 'breach with no incident'), 'water take over its daily limit');
  ok(has('TAF-OUT TSS', 'breach with no incident'), 'discharge over its limit');
  ok(!has('TAF-OUT NH4N', 'breach with no incident'), 'a breach with an incident is owned');
  ok(has('NC-0002', 'regulator not told'));
  ok(has('AN-001', 'notice deadline'));
  ok(has('TAF-WP1', 'renewal window missed'));
  ok(has('RQY-DP1', 'renewal due soon'));
  ok(has('RSD-LU1', 'lapse date close'));
  ok(has('RQY-LU1 cond 9', 'condition overdue') && has('RQY-LU1 cond 5', 'condition overdue') && has('KRY-EPL cond M2', 'condition overdue'));
  ok(has('KRY-EPL cond R1', 'due within 14 days') && has('RSD-LU1 cond 7', 'due within 14 days'));
  ok(has('RQY-BORE1', 'water records missing') && has('RQY-BORE1', 'meter verification due'));
  ok(!att.some((r) => r.item === 'TAF-BORE'), 'a complete, verified water meter needs nothing');
  ok(has('PL-002', 'plan review overdue') && has('PL-003', 'plan not tested'));
  ok(has('IN-001', 'inspection actions overdue') && !att.some((r) => r.item === 'IN-003'), 'actions not yet due are not flagged');
  ok(has('CP-001', 'complaint not answered') && !att.some((r) => r.item === 'CP-003'), 'a complaint from yesterday is not yet late');
  ok(has('NC-0003', 'incident not closed'));
  ok(!att.some((r) => r.item === 'NC-0001' || r.item === 'INF-001' || r.item === 'CP-004'), 'closed and answered records need nothing');
  ok(att[0].severity === 1, 'worst first');

  const comp = await call(['compliance']);
  const finds = (rule, code) => comp.some((r) => r.rule === rule && (r.code === code || r.code.startsWith(`${code} `)));
  ok(finds('RMA-S124-RENEWAL', 'TAF-WP1') && !finds('RMA-S124-RENEWAL', 'RQY-DP1'), 'the six-month date has passed only for TAF-WP1');
  ok(finds('RMA-S125-LAPSE', 'RSD-LU1'));
  ok(finds('CONDITION', 'RQY-LU1 cond 9') && !finds('CONDITION', 'TAF-DP1 cond 5'));
  ok(finds('LIMIT', 'RQY-BORE1 VOLUME') && finds('LIMIT', 'TAF-OUT TSS'));
  ok(finds('NOTIFY-REGULATOR', 'NC-0002') && !finds('NOTIFY-REGULATOR', 'NC-0001'), 'told within the window');
  ok(!finds('ABATEMENT', 'AN-001'), 'the abatement deadline has not passed yet');
  ok(finds('WATER-RECORDS', 'RQY-BORE1') && !finds('WATER-RECORDS', 'TAF-BORE'));
  ok(!finds('WATER-VERIFY', 'RQY-BORE1'), 'verified 4.9 years ago is still inside five years');
  ok(finds('PLAN-REVIEW', 'PL-002') && finds('PIRMP-TEST', 'PL-003'));
  ok(!comp.some((r) => r.rule === 'EPL-ANNUAL-RETURN'), 'the annual return is due, not late');
  ok(!comp.some((r) => r.rule === 'RMA-EXPIRED'));

  ok((await call(['exceedances'])).filter((r) => r.incident === 'NO').length === 2);
  ok((await call(['water'])).find((r) => r.point === 'RQY-BORE1').days_missing_30d === 4);
  ok((await call(['renewals'])).map((r) => r.code).join(',') === 'TAF-WP1,RQY-DP1,RSD-LU1', 'renewals in date order');
  ok((await call(['readings'])).some((r) => r.parameter === 'NH4N' && r.result === '<0.5' && r.verdict === 'ok'), 'a less-than result is never a breach');
  ok((await call(['stats'])).find((r) => r.site === 'TAF').breaches_12m === 2);

  // Lookup: code, prefix, name words, authority reference, the attention list's own wording, ambiguity, misses, bad flags.
  ok((await call(['site', 'ruahine'])).site.code === 'RQY');
  ok((await call(['consent', 'auth140321.01.01'])).consent.code === 'TAF-DP1', 'by the council reference');
  ok((await call(['consent', 'TAF-WP1'])).consent.days_to_renew_by < 0);
  ok((await call(['incident', 'nc-0001'])).reading[0].parameter === 'NH4N');
  await fail(['site', 'r'], /Ambiguous/);
  await fail(['consent', 'nothing like this'], /No matching/);
  await fail(['attention', '--wat'], /Unknown flag/);
  await fail(['attention', 'extra'], /takes no arguments/);
  await fail(['attention', '--json=no'], /boolean/);
  await fail(['nonsense'], /Unknown command/);
  await fail(['met', 'RQY-LU1 cond 5', `--on=${day(0)}`, '--by=x'], /--actor is required/);

  // Evidence clears an overdue condition, by the attention list's wording.
  await fail(['met', 'RQY-LU1 cond 5', `--on=${day(3)}`, '--by=Hemi Walker', actor], /future/);
  const m = await call(['met', 'RQY-LU1 cond 5', `--on=${day(0)}`, '--by=Hemi Walker', '--reference=DG-2026-11', actor]);
  ok(m.condition === 'RQY-LU1-5' && m.next_due === day(30));
  ok(!(await call(['attention'])).some((r) => r.item === 'RQY-LU1 cond 5'), 'evidence clears the overdue flag');
  await assert.rejects(() => db.query(`update evidence set done_by = 'someone else'`), /never changed/); checks++;

  // A breach from reading to close, every gate tried on the way.
  await fail(['reading', '--point=TAF-OUT', '--parameter=TSS', '--value=40', '--unit=mg/L', actor], /does not match/);
  await fail(['reading', '--point=TAF-OUT', '--parameter=Zinc', '--value=0.1', actor], /--unit is required/);
  await fail(['reading', '--point=TAF-OUT', '--parameter=TSS', '--value=lots', actor], /must be a number/);
  const ok1 = await call(['reading', '--point=TAF-OUT', '--parameter=Total suspended solids', '--value=31', '--lab-ref=ARL 78501', actor]);
  ok(ok1.parameter === 'TSS' && ok1.verdict === 'ok' && !ok1.incident_opened, 'aliases map and a clean result opens nothing');
  await fail(['reading', '--point=TAF-OUT', '--parameter=TSS', '--value=99', actor], /never changed/);
  await assert.rejects(() => db.query(`update readings set value = 0`), /never changed/); checks++;
  const br = await call(['reading', '--point=TAF-OUT', '--parameter=NH4N', '--value=14', `--on=${day(-1)}`, actor]);
  ok(br.verdict === 'over limit' && /^NC-/.test(br.incident_opened) && br.next.includes('Waikato Regional Council'), 'a breach opens an incident by itself');
  const nc = br.incident_opened;
  const ph = await call(['reading', '--point=KRY-SW1', '--parameter=pH', '--value=5.9', actor]);
  ok(ph.verdict === 'under minimum' && ph.incident_opened, 'under a minimum is a breach too');
  await fail(['close-incident', nc, '--cause=x', '--corrective-action=y', '--note=z', actor], /has not been told/);
  await fail(['notify', nc, `--on=${day(-30)}`, '--by=Aroha Ngata', '--reference=W-1', actor], /before the incident was found/);
  const nt = await call(['notify', nc, `--on=${day(0)}`, '--by=Aroha Ngata', '--reference=WRC-ENF-25001', actor]);
  ok(nt.late === false && nt.days_after_found === 0);
  await fail(['notify', nc, `--on=${day(0)}`, '--by=x', '--reference=y', actor], /was notified/);
  const dn = await call(['draft-notification', nc]);
  const dnText = fs.readFileSync(dn.file, 'utf8');
  ok(dnText.includes('AUTH140321.01.01') && dnText.includes('over limit'), 'notification drafted from the record');
  await fail(['close-incident', nc, '--cause=Aerator', '--note=Fixed', actor], /corrective-action is required/);
  ok((await call(['close-incident', nc, '--cause=Aerator 1 tripped', '--corrective-action=Aerator reset; alarm added to the plant phone', '--note=Next sample clear', actor])).status === 'closed');
  await fail(['close-incident', nc, '--cause=a', '--corrective-action=b', '--note=c', actor], /was closed/);
  ok((await call(['incident', nc])).activity.length >= 3, 'every step is in the activity log');

  // The seed's open problems, cleared by hand.
  const r1 = await call(['raise', '--consent=RQY-WP1', '--condition=RQY-WP1 cond 6', '--kind=exceedance', '--description=Bore 1 took 1,084 m3 on one day', '--code=NC-T1', actor]);
  ok(r1.tell_regulator.startsWith('yes: Horizons'));
  await fail(['raise', '--consent=RQY-WP1', '--condition=TAF-DP1 cond 6', '--kind=exceedance', '--description=x', actor], /not a condition of/);
  await fail(['raise', '--consent=RQY-WP1', '--kind=flood', '--description=x', actor], /must be one of/);
  await db.query(`update incidents set reading_id = (select r.id from readings r join points p on p.id = r.point_id where p.code = 'RQY-BORE1' and r.value = 1084) where code = 'NC-T1'`);
  ok(!(await call(['attention'])).some((r) => r.item.startsWith('RQY-BORE1 VOLUME')), 'linking the incident owns the breach');
  await call(['notify', 'NC-0002', `--on=${day(0)}`, '--by=Dan Price', '--reference=EPA 131555', actor]);
  ok((await call(['compliance'])).some((r) => r.rule === 'NOTIFY-REGULATOR' && r.code === 'NC-0002' && r.finding.includes('3 days')), 'a late notification stays on the record');
  const rn = await call(['renewal', 'TAF-WP1', '--reference=APP-2026-1188', actor]);
  ok(rn.in_time === false && rn.note.includes('s124'));
  await fail(['renewal', 'TAF-WP1', '--reference=again', actor], /was lodged/);
  await fail(['renewal', 'RQY-LU1', '--reference=x', actor], /no expiry/);
  ok(!(await call(['compliance'])).some((r) => r.rule === 'RMA-S124-RENEWAL'));
  const dr = await call(['draft-renewal', 'RQY-DP1']);
  ok(fs.readFileSync(dr.file, 'utf8').includes('Lodge by') && dr.days_to_renew_by > 0);
  await call(['commenced', 'RSD-LU1', actor]);
  await fail(['commenced', 'RSD-LU1', actor], /was given effect/);
  ok(!(await call(['attention'])).some((r) => r.rule === 'lapse date close'));
  await fail(['verify-meter', 'TAF-OUT', '--by=x', actor], /not a water meter/);
  ok((await call(['verify-meter', 'RQY-BORE1', '--by=Waterforce', actor])).meter_verified_on === day(0));
  await call(['review-plan', 'PL-002', '--version=3', actor]);
  await call(['test-plan', 'pollution incident', actor]);
  const att2 = await call(['attention']);
  ok(!att2.some((r) => ['PL-002', 'PL-003'].includes(r.item)), 'plans reviewed and tested');
  await fail(['inspection-done', 'IN-002', actor], /no actions/);
  ok((await call(['inspection-done', 'IN-001', actor])).late === true);
  await fail(['inspection', '--consent=TAF-DP1', '--officer=WRC', '--grade=significant', actor], /needs --actions-due/);
  ok((await call(['inspection', '--consent=TAF-DP1', '--officer=WRC compliance officer', '--grade=low_risk', '--findings=Stockpile covered', actor])).code === 'IN-005');
  await fail(['notice', '--site=TAF', '--kind=abatement', '--issued-by=WRC', '--reference=AN-9', '--requirement=x', actor], /needs --comply-by/);
  await fail(['notice', '--site=RQY', '--consent=TAF-DP1', '--kind=infringement', '--issued-by=x', '--reference=y', '--requirement=z', actor], /is not at RQY/);
  const n2 = await call(['notice', '--site=RQY', '--consent=RQY-LU1', '--kind=infringement', '--issued-by=Horizons Regional Council', '--reference=INF-HRC-7001', '--requirement=Crushing outside consented hours', '--amount=500', actor]);
  ok(n2.code === 'INF-002');
  const resp = await call(['draft-response', 'AN-001']);
  ok(fs.readFileSync(resp.file, 'utf8').includes('AN-2026-0412'));
  await fail(['comply', 'AN-001', '--evidence=', actor], /evidence is required/);
  ok((await call(['comply', 'AN-001', '--evidence=Stockpile covered and bunded; photos sent', actor])).late === false);
  await fail(['comply', 'AN-001', '--evidence=again', actor], /was complied/);
  ok(!(await call(['attention'])).some((r) => r.item === 'AN-001'));
  const cp = await call(['log-complaint', '--site=RQY', '--kind=noise', '--detail=Crusher running at 6am', '--location=Quarry Road', actor]);
  ok(/^CP-/.test(cp.code) && cp.next);
  await fail(['close-complaint', cp.code, actor], /no response/);
  await call(['respond', cp.code, '--response=Crusher start moved to 7am; caller rung back', '--incident=NC-0003', actor]);
  ok((await call(['close-complaint', cp.code, actor])).closed_on === day(0));
  await fail(['respond', cp.code, '--response=again', actor], /was closed/);
  await call(['respond', 'CP-001', '--response=Water cart running on dry days; washing claim offered', actor]);
  ok(!(await call(['attention'])).some((r) => r.item === 'CP-001'));

  // Set up a new consent and its conditions the way a person would.
  await fail(['add-consent', '--site=RQY', '--reference=X', '--kind=land_use', '--activity=x', `--granted=${day(-10)}`, `--expires=${day(-20)}`, actor], /after --granted/);
  const ac = await call(['add-consent', '--site=RQY', '--reference=DIS-2026-0101', '--kind=discharge_permit', '--activity=Discharge of wash plant water to land',
    `--granted=${day(-30)}`, `--expires=${day(3650)}`, '--code=RQY-DP2', actor]);
  ok(ac.code === 'RQY-DP2' && ac.renew_by < day(3650));
  await fail(['add-condition', 'RQY-DP2', '--number=1', '--kind=limit', '--summary=pH', actor], /needs --point/);
  const lc = await call(['add-condition', 'RQY-DP2', '--number=4', '--kind=limit', '--summary=Wash water pH 6 to 9', '--point=RQY-POND', '--parameter=pH', '--unit=pH units', '--min=6', '--max=9', '--notify-within=2', actor]);
  ok(lc.code === 'RQY-DP2-4' && lc.limit === 'PH at RQY-POND');
  await fail(['add-condition', 'RQY-DP2', '--number=4', '--kind=general', '--summary=again', actor], /already has a condition 4/);
  ok((await call(['add-condition', 'RQY-DP2', '--number=6', '--kind=reporting', '--summary=Quarterly discharge report', '--every=91', `--first-due=${day(60)}`, actor])).every_days === 91);
  ok((await call(['reading', '--point=RQY-POND', '--parameter=PH', '--value=9.4', actor])).incident_opened, 'a new limit is enforced straight away');

  // Import from CS-VUE: dry run, reject bad files, import, never twice.
  const cf = path.join(REPO_ROOT, 'fixtures', 'cs-vue-conditions.csv');
  const rf = path.join(REPO_ROOT, 'fixtures', 'cs-vue-readings.csv');
  const dry = await call(['import', 'cs-vue', `--conditions=${cf}`, `--readings=${rf}`, '--dry-run', actor]);
  ok(dry.conditions_new === 4 && dry.conditions_already_here === 1 && dry.reading_rows === 4 && dry.problems.length === 0, 'dry run counts');
  ok((await db.query(`select * from readings where source = 'import'`)).length === 0, 'dry run writes nothing');
  const bad = path.join(REPO_ROOT, 'fixtures', 'bad-conditions.csv');
  ok((await call(['import', 'cs-vue', `--conditions=${bad}`, '--dry-run', actor])).problems.length === 5, 'every bad row is reported');
  await fail(['import', 'cs-vue', `--conditions=${bad}`, actor], /Nothing imported[\s\S]*NOWHERE-1[\s\S]*Whenever it rains/);
  await fail(['import', 'other', `--conditions=${cf}`, actor], /Usage: import/);
  await fail(['import', 'cs-vue', actor], /Give --conditions/);
  const imp = await call(['import', 'cs-vue', `--conditions=${cf}`, `--readings=${rf}`, actor]);
  ok(imp.conditions_new === 4 && imp.readings_new === 4 && imp.breaches_to_review.length === 1, 'an imported breach is listed for review');
  ok((await call(['attention'])).some((r) => r.rule === 'breach with no incident' && r.item.startsWith('RQY-DG1 DUST_DEPOSITION 2025-08-10')), 'imported history is checked too');
  const c7 = (await db.query(`select every_days, first_due, kind from conditions where code = 'RQY-DP1-7'`))[0];
  ok(c7.every_days === 365 && c7.first_due === '2027-09-30' && c7.kind === 'reporting', 'day-first dates and frequencies read correctly');
  ok((await db.query(`select qualifier from readings where lab_ref = 'ARL 76001'`))[0].qualifier === '<');
  const again = await call(['import', 'cs-vue', `--conditions=${cf}`, `--readings=${rf}`, actor]);
  ok(again.conditions_new === 0 && again.readings_new === 0, 'import twice adds nothing');

  // Drafts and export.
  const ar = await call(['annual-report', 'TAF-DP1', `--year=${Number(day(0).slice(0, 4)) + 1}`]);
  ok(ar.results > 0 && fs.readFileSync(ar.file, 'utf8').includes('Monitoring results'));
  await fail(['annual-report', 'TAF-DP1', '--year=nineteen'], /four-digit/);
  await fail(['draft-renewal', 'RQY-LU1'], /no expiry/);
  const wk = await call(['weekly-review']);
  ok(fs.readFileSync(wk.file, 'utf8').includes('Needs attention') && wk.needs_attention > 0 && wk.urgent > 0);
  const out = path.join(tmp, 'snapshot.json');
  const snap = await call(['export', `--out=${out}`]);
  ok(snap.tables.readings > 137 && JSON.parse(fs.readFileSync(out, 'utf8')).activity.length > 30);
  await fail(['export', `--out=${out}`], /already exists/);

  // The activity log is append-only.
  await assert.rejects(() => db.query(`update activity set actor = 'someone else'`), /append-only/); checks++;
  await assert.rejects(() => db.query('delete from activity'), /append-only/); checks++;

  for (const name of Object.keys(usage)) ok(exercised.has(name), `smoke exercises ${name}`);
} finally {
  await db.close();
}

// The CLI, views and documents run as a person would run them.
const env = { ...process.env, DATA_DIR: path.join(tmp, 'db'), OUTPUT_DIR: tmp };
for (const args of [['scripts/consent.mjs', 'attention'], ['scripts/consent.mjs', 'consent', 'TAF-DP1', '--json'], ['scripts/view.mjs'], ['scripts/docs.mjs']]) {
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')} failed: ${r.stderr}`);
  checks++;
}
const miss = spawnSync(process.execPath, ['scripts/consent.mjs', 'site', 'r'], { cwd: REPO_ROOT, env, encoding: 'utf8' });
assert.equal(miss.status, 1);
assert.match(miss.stderr, /Ambiguous/);
checks++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`PASS  ${checks} checks, ${Object.keys(usage).length} commands`);
