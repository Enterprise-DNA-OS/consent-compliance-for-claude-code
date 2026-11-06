-- Synthetic demo data: one business holding consents at three New Zealand sites
-- (a quarry, a food processing plant and a subdivision) and an environment
-- protection licence at a recycling yard in New South Wales. Dates are relative
-- to today so the attention list always has something to say: a water take over
-- its daily limit, a discharge over its suspended solids limit with no incident
-- raised, an oil spill the EPA has not heard about, an abatement notice due in
-- ten days, a water permit whose renewal window has passed, a stormwater permit
-- whose window is about to close, an earthworks consent close to lapsing, missing
-- water meter records, a meter due for verification, an untested pollution
-- incident response plan, an overdue erosion and sediment control plan review,
-- overdue monitoring and an unanswered dust complaint.
-- Idempotent: the whole file does nothing once the demo sites exist. Never run
-- against a real database.

do $$
begin
if exists (select 1 from sites where code = 'RQY') then return; end if;

insert into sites (code, name, country, region, regulator, operator, address) values
  ('RQY', 'Ruahine Quarry', 'NZ', 'Manawatu-Whanganui', 'Horizons Regional Council', 'Kowhai Aggregates Ltd', '420 Quarry Road, Ashhurst'),
  ('TAF', 'Te Awa Foods processing plant', 'NZ', 'Waikato', 'Waikato Regional Council', 'Kowhai Aggregates Ltd (Te Awa Foods division)', '18 Factory Road, Morrinsville'),
  ('RSD', 'Riverstone subdivision', 'NZ', 'Canterbury', 'Environment Canterbury', 'Kowhai Aggregates Ltd', 'Riverstone Drive, Halswell'),
  ('KRY', 'Kurri Kurri recycling yard', 'AU', 'Hunter, NSW', 'NSW Environment Protection Authority', 'Kowhai Recycling Pty Ltd', '7 Mitchell Avenue, Kurri Kurri NSW');

insert into consents (code, site_id, authority_ref, kind, activity, granted_on, commenced_on, lapse_on, expires_on, renewal_lodged_on, holder)
select v.code, s.id, v.ref, v.kind, v.activity, current_date - v.granted, case when v.commenced is null then null else current_date - v.commenced end,
  null, case when v.expires is null then null else current_date + v.expires end, null, v.holder
from (values
  ('RQY-LU1','RQY','LUC-2009-0144','land_use','Quarrying and crushing of greywacke, up to 200,000 tonnes a year',6000,5900,null::int,'Kowhai Aggregates Ltd'),
  ('RQY-DP1','RQY','DIS-2001-0871','discharge_permit','Discharge of quarry stormwater from the settling pond to the Pohangina River tributary',9000,8990,200,'Kowhai Aggregates Ltd'),
  ('RQY-AD1','RQY','ATH-2016-0022','discharge_permit','Discharge of dust to air from quarrying, crushing and stockpiles',3600,3590,3000,'Kowhai Aggregates Ltd'),
  ('RQY-WP1','RQY','WAT-2017-0315','water_permit','Take groundwater from bore 1 at up to 12 litres a second for the wash plant',3000,2990,2500,'Kowhai Aggregates Ltd'),
  ('TAF-DP1','TAF','AUTH140321.01.01','discharge_permit','Discharge of treated processing wastewater to land and the Piako River',2400,2390,4000,'Kowhai Aggregates Ltd'),
  ('TAF-WP1','TAF','AUTH118870.01.01','water_permit','Take groundwater at up to 25 litres a second for processing and wash-down',12600,12590,120,'Kowhai Aggregates Ltd'),
  ('RSD-LU1','RSD','CRC221904','land_use','Earthworks of 48,000 cubic metres over 12 hectares for a 140 lot subdivision',1650,null,null,'Kowhai Aggregates Ltd'),
  ('KRY-EPL','KRY','EPL 20931','epa_licence','Waste storage and resource recovery, more than 6,000 tonnes a year',4000,3990,null,'Kowhai Recycling Pty Ltd')
) v(code, site, ref, kind, activity, granted, commenced, expires, holder)
join sites s on s.code = v.site;

insert into conditions (code, consent_id, number, kind, summary, wording, owner, every_days, first_due, notify_within_days)
select v.consent || '-' || v.num, c.id, v.num, v.kind, v.summary, v.wording, v.owner, v.every,
  case when v.first is null then null else current_date + v.first end, v.notify
from (values
  ('RQY-LU1','5','monitoring','Read the boundary dust deposition gauges every month','The consent holder shall measure dust deposition at gauges DG1 and DG2 at intervals of no more than one month.','Site manager',30,null::int,null::int),
  ('RQY-LU1','9','reporting','Annual quarry compliance report to the council','By 30 September each year the consent holder shall provide an annual report covering monitoring results, complaints and any non-compliance.','Compliance lead',365,null,null),
  ('RQY-LU1','12','general','Operate between 7am and 6pm, Monday to Saturday','Quarrying and crushing shall only occur between 0700 and 1800 hours Monday to Saturday.','Site manager',null,null,null),
  ('RQY-LU1','14','limit','Boundary dust deposition no more than 4 g/m2 in 30 days','Dust deposition at any boundary gauge shall not exceed 4 g/m2/30 days above background.','Site manager',null,null,1),
  ('RQY-DP1','3','monitoring','Sample the settling pond outlet at least every three months','The discharge shall be sampled at least quarterly, and after any rainfall event greater than 25 mm in 24 hours.','Site manager',91,null,null),
  ('RQY-DP1','4','limit','Pond outlet suspended solids no more than 100 g/m3','Total suspended solids in the discharge shall not exceed 100 g/m3.','Site manager',null,null,1),
  ('RQY-AD1','2','management_plan','Keep the dust management plan current and send changes to the council','The consent holder shall maintain a dust management plan and provide any amended version to the council within 10 working days.','Compliance lead',null,null,null),
  ('RQY-WP1','6','limit','No more than 1,000 m3 a day from bore 1','The rate of take shall not exceed 12 litres per second and the daily volume shall not exceed 1,000 cubic metres.','Site manager',null,null,2),
  ('TAF-DP1','5','monitoring','Monthly composite sample of treated wastewater','A 24 hour flow-proportional composite sample shall be taken monthly and analysed for BOD5, total suspended solids and ammoniacal nitrogen.','Plant engineer',30,null,null),
  ('TAF-DP1','6','limit','Treated wastewater limits: BOD5 50, suspended solids 60, ammoniacal nitrogen 10 g/m3','The discharge shall not exceed BOD5 50 g/m3, total suspended solids 60 g/m3 or ammoniacal nitrogen 10 g/m3 in any sample.','Plant engineer',null,null,1),
  ('TAF-DP1','11','reporting','Annual monitoring report to Waikato Regional Council','By 31 August each year the consent holder shall provide a report of all monitoring for the year to 30 June.','Compliance lead',365,null,null),
  ('TAF-DP1','13','notification','Tell the council within 24 hours of any breach of condition 6','The consent holder shall notify the council within 24 hours of becoming aware of any exceedance of condition 6.','Plant engineer',null,null,null),
  ('TAF-WP1','3','limit','No more than 2,200 m3 a day from the production bore','The daily volume taken shall not exceed 2,200 cubic metres.','Plant engineer',null,null,2),
  ('RSD-LU1','7','management_plan','Erosion and sediment control plan certified before earthworks start','No earthworks shall commence until an erosion and sediment control plan has been certified by the council.','Project manager',null,10,null),
  ('RSD-LU1','9','notification','Tell the council five working days before earthworks start','The consent holder shall notify the council at least five working days before earthworks commence.','Project manager',null,null,null),
  ('KRY-EPL','R1','reporting','Annual return to the EPA','The licensee must complete and supply an Annual Return in the approved form within 60 days after the end of each reporting period.','Yard manager',365,null,null),
  ('KRY-EPL','M2','monitoring','Monthly stormwater sampling at discharge point 1','Monitor discharge point 1 monthly for total suspended solids and pH.','Yard manager',30,null,null),
  ('KRY-EPL','L2','limit','Discharge point 1: suspended solids 50 mg/L, pH 6.5 to 8.5','Pollutants discharged at point 1 must not exceed TSS 50 mg/L and pH must be within 6.5 to 8.5.','Yard manager',null,null,0)
) v(consent, num, kind, summary, wording, owner, every, first, notify)
join consents c on c.code = v.consent;

insert into evidence (condition_id, done_on, done_by, reference, note)
select co.id, current_date - v.ago, v.by, v.ref, v.note
from (values
  ('RQY-LU1-5',100,'Hemi Walker','DG-2026-07','Both gauges read and sent to the lab'),
  ('RQY-LU1-5',70,'Hemi Walker','DG-2026-08','Both gauges read'),
  ('RQY-LU1-5',40,'Hemi Walker','DG-2026-09','Both gauges read'),
  ('RQY-LU1-9',400,'Sarah Lin','HRC receipt 88123','Annual report lodged by email'),
  ('RQY-DP1-3',50,'Hemi Walker','Hill Labs 3311902','Quarterly pond outlet sample'),
  ('TAF-DP1-5',42,'Aroha Ngata','ARL 77120','Monthly composite'),
  ('TAF-DP1-5',12,'Aroha Ngata','ARL 77984','Monthly composite'),
  ('TAF-DP1-11',70,'Sarah Lin','WRC portal 2026-0815','Annual monitoring report lodged'),
  ('KRY-EPL-R1',355,'Dan Price','EPA eConnect AR-20931','Annual return lodged'),
  ('KRY-EPL-M2',63,'Dan Price','ALS ES2630112','Monthly stormwater sample'),
  ('KRY-EPL-M2',33,'Dan Price','ALS ES2633381','Monthly stormwater sample')
) v(cond, ago, by, ref, note)
join conditions co on co.code = v.cond;

insert into points (code, site_id, consent_id, name, kind, max_rate_ls, meter_verified_on)
select v.code, s.id, c.id, v.name, v.kind, v.rate, case when v.verified is null then null else current_date - v.verified end
from (values
  ('RQY-DG1','RQY','RQY-LU1','Dust gauge DG1, eastern boundary','boundary',null::numeric,null::int),
  ('RQY-POND','RQY','RQY-DP1','Settling pond outlet','discharge',null,null),
  ('RQY-BORE1','RQY','RQY-WP1','Bore 1 water meter','water_meter',12,1800),
  ('TAF-OUT','TAF','TAF-DP1','Treated wastewater outfall','discharge',null,null),
  ('TAF-BORE','TAF','TAF-WP1','Production bore water meter','water_meter',25,700),
  ('KRY-SW1','KRY','KRY-EPL','Stormwater discharge point 1','discharge',null,null)
) v(code, site, consent, name, kind, rate, verified)
join sites s on s.code = v.site join consents c on c.code = v.consent;

insert into limits (condition_id, point_id, parameter, unit, min_value, max_value, basis)
select co.id, p.id, v.parameter, v.unit, v.min, v.max, v.basis
from (values
  ('RQY-LU1-14','RQY-DG1','DUST_DEPOSITION','g/m2/30d',null::numeric,4::numeric,'30 day gauge'),
  ('RQY-DP1-4','RQY-POND','TSS','g/m3',null,100,'single sample'),
  ('RQY-WP1-6','RQY-BORE1','VOLUME','m3',null,1000,'daily volume'),
  ('TAF-DP1-6','TAF-OUT','BOD5','g/m3',null,50,'single sample'),
  ('TAF-DP1-6','TAF-OUT','TSS','g/m3',null,60,'single sample'),
  ('TAF-DP1-6','TAF-OUT','NH4N','g/m3',null,10,'single sample'),
  ('TAF-WP1-3','TAF-BORE','VOLUME','m3',null,2200,'daily volume'),
  ('KRY-EPL-L2','KRY-SW1','TSS','mg/L',null,50,'single sample'),
  ('KRY-EPL-L2','KRY-SW1','PH','pH units',6.5,8.5,'single sample')
) v(cond, point, parameter, unit, min, max, basis)
join conditions co on co.code = v.cond join points p on p.code = v.point;

-- Daily water meter volumes for 60 days. Bore 1 has four days missing in the
-- last month and one day over its 1,000 m3 limit; the production bore is complete.
insert into readings (point_id, taken_on, parameter, value, unit, source)
select p.id, current_date - g, 'VOLUME', case when g = 8 then 1084 else 610 + (g * 37) % 260 end, 'm3', 'meter'
from points p, generate_series(1, 60) g where p.code = 'RQY-BORE1' and g not in (3, 4, 11, 19);
insert into readings (point_id, taken_on, parameter, value, unit, source)
select p.id, current_date - g, 'VOLUME', 1500 + (g * 53) % 420, 'm3', 'meter'
from points p, generate_series(1, 60) g where p.code = 'TAF-BORE';

insert into readings (point_id, taken_on, parameter, qualifier, value, unit, source, lab_ref)
select p.id, current_date - v.ago, v.parameter, v.q, v.value, v.unit, 'lab', v.lab
from (values
  ('RQY-DG1',100,'DUST_DEPOSITION','=',1.8::numeric,'g/m2/30d','DG-2026-07'),
  ('RQY-DG1',70,'DUST_DEPOSITION','=',3.2,'g/m2/30d','DG-2026-08'),
  ('RQY-DG1',40,'DUST_DEPOSITION','=',2.1,'g/m2/30d','DG-2026-09'),
  ('RQY-POND',140,'TSS','=',61,'g/m3','3302117'),
  ('RQY-POND',50,'TSS','=',42,'g/m3','3311902'),
  ('TAF-OUT',102,'BOD5','=',31,'g/m3','ARL 76221'),
  ('TAF-OUT',102,'TSS','=',38,'g/m3','ARL 76221'),
  ('TAF-OUT',102,'NH4N','=',6.2,'g/m3','ARL 76221'),
  ('TAF-OUT',72,'BOD5','=',28,'g/m3','ARL 76702'),
  ('TAF-OUT',72,'TSS','=',41,'g/m3','ARL 76702'),
  ('TAF-OUT',72,'NH4N','=',7.9,'g/m3','ARL 76702'),
  ('TAF-OUT',42,'BOD5','=',44,'g/m3','ARL 77120'),
  ('TAF-OUT',42,'TSS','=',52,'g/m3','ARL 77120'),
  ('TAF-OUT',42,'NH4N','=',13.5,'g/m3','ARL 77120'),
  ('TAF-OUT',12,'BOD5','=',36,'g/m3','ARL 77984'),
  ('TAF-OUT',12,'TSS','=',74,'g/m3','ARL 77984'),
  ('TAF-OUT',12,'NH4N','<',0.5,'g/m3','ARL 77984'),
  ('KRY-SW1',63,'TSS','=',22,'mg/L','ES2630112'),
  ('KRY-SW1',63,'PH','=',6.9,'pH units','ES2630112'),
  ('KRY-SW1',33,'TSS','=',38,'mg/L','ES2633381'),
  ('KRY-SW1',33,'PH','=',7.2,'pH units','ES2633381')
) v(point, ago, parameter, q, value, unit, lab)
join points p on p.code = v.point;

insert into incidents (code, consent_id, condition_id, reading_id, kind, found_on, description, notified_on, notified_by, regulator_ref, cause, corrective_action, closed_on, closeout_note)
select v.code, c.id, co.id, r.id, v.kind, current_date - v.found, v.description,
  case when v.notified is null then null else current_date - v.notified end, v.by, v.ref, v.cause, v.fix,
  case when v.closed is null then null else current_date - v.closed end, v.note
from (values
  ('NC-0001','TAF-DP1','TAF-DP1-6','TAF-OUT','NH4N',42,'exceedance',40,'Ammoniacal nitrogen 13.5 g/m3 at the outfall against a limit of 10',39,'Aroha Ngata','WRC-ENF-24711','Aerator 2 failed over a long weekend','Aerator 2 repaired; daily ammonia checks for two weeks',20,'Two weeks of daily checks under 5 g/m3; council accepted the report'),
  ('NC-0002','KRY-EPL','KRY-EPL-L2',null,null,null,'spill',3,'Hydraulic oil from a loader reached the stormwater pit near discharge point 1',null,null,null,null,'Pit isolated and pumped out',null,null),
  ('NC-0003','RQY-LU1','RQY-LU1-5',null,null,null,'missed_monitoring',45,'Gauge DG2 bottle broken; one month of dust deposition not measured',44,'Sarah Lin','HRC-COMP-5531','Bottle knocked over by a loader',null,null,null)
) v(code, consent, cond, point, parameter, ago, kind, found, description, notified, by, ref, cause, fix, closed, note)
join consents c on c.code = v.consent
left join conditions co on co.code = v.cond
left join points p on p.code = v.point
left join readings r on r.point_id = p.id and r.parameter = v.parameter and r.taken_on = current_date - v.ago;

insert into inspections (code, consent_id, inspected_on, officer, grade, findings, actions_due, actions_done_on)
select v.code, c.id, current_date - v.ago, v.officer, v.grade, v.findings,
  case when v.due is null then null else current_date + v.due end, case when v.done is null then null else current_date - v.done end
from (values
  ('IN-001','TAF-DP1',50,'Waikato Regional Council compliance officer','moderate','Sludge stockpile uncovered; flow meter calibration certificate not on file',-20,null::int),
  ('IN-002','RQY-LU1',90,'Horizons Regional Council compliance officer','full','All conditions met on the day',null,null),
  ('IN-003','RSD-LU1',20,'Environment Canterbury compliance officer','low_risk','Silt fence down on the eastern boundary',5,null),
  ('IN-004','KRY-EPL',200,'NSW EPA officer','full','Stockpile heights and bunding within licence',null,null)
) v(code, consent, ago, officer, grade, findings, due, done)
join consents c on c.code = v.consent;

insert into notices (code, consent_id, site_id, kind, issued_on, issued_by, reference, requirement, comply_by, complied_on, amount)
select v.code, c.id, s.id, v.kind, current_date - v.ago, v.by, v.ref, v.req,
  case when v.comply is null then null else current_date + v.comply end, case when v.done is null then null else current_date - v.done end, v.amount
from (values
  ('AN-001','TAF-DP1','TAF','abatement',18,'Waikato Regional Council','AN-2026-0412','Cover the sludge stockpile and stop leachate reaching the farm drain',10,null::int,null::numeric),
  ('INF-001','RSD-LU1','RSD','infringement',60,'Environment Canterbury','INF-88213','Sediment discharged to the Halswell drain',-40,30,750)
) v(code, consent, site, kind, ago, by, ref, req, comply, done, amount)
join consents c on c.code = v.consent join sites s on s.code = v.site;

insert into plans (code, site_id, consent_id, name, kind, version, certified_on, review_every_months, last_reviewed_on, last_tested_on)
select v.code, s.id, c.id, v.name, v.kind, v.version, case when v.cert is null then null else current_date - v.cert end, v.months,
  case when v.reviewed is null then null else current_date - v.reviewed end, case when v.tested is null then null else current_date - v.tested end
from (values
  ('PL-001','RQY','RQY-AD1','Dust management plan','dust','4',900,12,300,null::int),
  ('PL-002','RSD','RSD-LU1','Erosion and sediment control plan','erosion_sediment','2',null,12,430,null),
  ('PL-003','KRY','KRY-EPL','Pollution incident response management plan','pirmp','3',null,12,200,400),
  ('PL-004','TAF','TAF-DP1','Wastewater management plan','other','6',800,24,100,null)
) v(code, site, consent, name, kind, version, cert, months, reviewed, tested)
join sites s on s.code = v.site join consents c on c.code = v.consent;

insert into complaints (code, site_id, received_on, kind, location, detail, response, responded_on, closed_on)
select v.code, s.id, current_date - v.ago, v.kind, v.location, v.detail, v.response,
  case when v.responded is null then null else current_date - v.responded end, case when v.closed is null then null else current_date - v.closed end
from (values
  ('CP-001','RQY',4,'dust','14 Kowhai Road','Dust settling on washing and cars on a dry north-westerly',null::text,null::int,null::int),
  ('CP-002','RSD',20,'dust','Halswell Junction Road','Dust blowing off the earthworks','Water cart added on windy days and the stockpile covered',19,15),
  ('CP-003','TAF',1,'odour','State Highway 26','Smell from the treatment ponds in the evening',null,null,null),
  ('CP-004','KRY',9,'noise','Mitchell Avenue','Reversing beepers before 7am','Loader start time moved to 7am; broadband alarms ordered',8,null)
) v(code, site, ago, kind, location, detail, response, responded, closed)
join sites s on s.code = v.site;

insert into activity (actor, command, record_id, detail) values
  ('Demo data', 'seed', null, 'Demo sites, consents, conditions, monitoring and notices loaded');
end $$;
