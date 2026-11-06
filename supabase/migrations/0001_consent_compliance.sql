-- Resource consent and environmental licence compliance for the business that
-- holds them: sites, consents and licences, every condition with its due rule,
-- the evidence that meets each one, monitoring points, limits and readings,
-- non-compliances and what the council was told, council inspections and their
-- grades, abatement and infringement notices, management plans, complaints from
-- the public, imports and an append-only activity log.
-- Plain Postgres; runs the same on PGlite. No extensions.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null check (country in ('NZ','AU')),
  region text not null,
  regulator text not null,             -- the regional council or EPA that holds the consents
  operator text not null,              -- the business that holds them
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  site_id uuid not null references sites(id),
  authority_ref text not null,         -- the council's or EPA's number for it
  kind text not null check (kind in ('land_use','water_permit','discharge_permit','coastal_permit','subdivision','epa_licence')),
  activity text not null,
  granted_on date not null,
  commenced_on date,                   -- given effect to (RMA s125); null means not yet
  lapse_on date,                       -- lapses on this date if not given effect (default grant + 5 years)
  expires_on date,                     -- null for a consent with no expiry
  renewal_lodged_on date,
  renewal_ref text,
  status text not null default 'active' check (status in ('active','surrendered','expired','replaced')),
  holder text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on is null or expires_on > granted_on),
  check (lapse_on is null or lapse_on > granted_on)
);

create table conditions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  consent_id uuid not null references consents(id),
  number text not null,                -- as numbered on the consent
  kind text not null check (kind in ('monitoring','reporting','limit','management_plan','notification','general')),
  summary text not null,
  wording text,                        -- the condition as written
  owner text,
  every_days int check (every_days is null or every_days between 1 and 3660),  -- recurring; null means once or ongoing
  first_due date,
  notify_within_days int check (notify_within_days is null or notify_within_days between 0 and 30), -- tell the regulator this soon after a breach
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consent_id, number)
);

-- Proof a condition was met on a date: a report lodged, a survey done, a plan sent.
create table evidence (
  id uuid primary key default gen_random_uuid(),
  condition_id uuid not null references conditions(id),
  done_on date not null,
  done_by text not null,
  reference text,                      -- the council's receipt, a file name, a lab job number
  note text,
  created_at timestamptz not null default now()
);

create table points (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  site_id uuid not null references sites(id),
  consent_id uuid references consents(id),
  name text not null,
  kind text not null check (kind in ('water_meter','discharge','bore','stack','receiving_water','boundary','other')),
  max_rate_ls numeric check (max_rate_ls is null or max_rate_ls >= 0),   -- water meters: the consented rate of take
  meter_verified_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table limits (
  id uuid primary key default gen_random_uuid(),
  condition_id uuid not null references conditions(id),
  point_id uuid not null references points(id),
  parameter text not null,
  unit text not null,
  min_value numeric,
  max_value numeric,
  basis text not null default 'single sample',
  created_at timestamptz not null default now(),
  unique (point_id, parameter),
  check (min_value is not null or max_value is not null)
);

create table readings (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references points(id),
  taken_on date not null,
  parameter text not null,
  qualifier text not null default '=' check (qualifier in ('<','=','>')),
  value numeric not null,
  unit text not null,
  source text not null default 'field' check (source in ('lab','meter','field','import')),
  lab_ref text,
  created_at timestamptz not null default now(),
  unique (point_id, taken_on, parameter)
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  consent_id uuid not null references consents(id),
  condition_id uuid references conditions(id),
  reading_id uuid references readings(id),
  kind text not null check (kind in ('exceedance','missed_monitoring','late_report','spill','complaint','other')),
  found_on date not null,
  description text not null,
  notified_on date,
  notified_by text,
  regulator_ref text,
  cause text,
  corrective_action text,
  closed_on date,
  closeout_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notified_on is null or notified_on >= found_on),
  check (closed_on is null or closed_on >= found_on)
);

create table inspections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  consent_id uuid not null references consents(id),
  inspected_on date not null,
  officer text not null,
  grade text not null check (grade in ('full','low_risk','moderate','significant')),
  findings text,
  actions_due date,
  actions_done_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  consent_id uuid references consents(id),
  site_id uuid not null references sites(id),
  kind text not null check (kind in ('abatement','infringement','enforcement_order','excessive_noise','penalty_notice','clean_up_notice')),
  issued_on date not null,
  issued_by text not null,
  reference text not null,
  requirement text not null,
  comply_by date,
  complied_on date,
  amount numeric check (amount is null or amount >= 0),   -- infringement or penalty fee, if any
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  site_id uuid not null references sites(id),
  consent_id uuid references consents(id),
  name text not null,
  kind text not null check (kind in ('cemp','erosion_sediment','dust','noise','pirmp','spill','other')),
  version text not null default '1',
  certified_on date,                   -- certified or approved by the regulator
  review_every_months int not null default 12 check (review_every_months between 1 and 120),
  last_reviewed_on date,
  last_tested_on date,                 -- pollution incident response plans are tested, not just read
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  site_id uuid not null references sites(id),
  received_on date not null,
  kind text not null check (kind in ('dust','odour','noise','water','traffic','other')),
  location text,
  detail text not null,
  response text,
  responded_on date,
  incident_id uuid references incidents(id),
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  file_name text not null,
  file_sha256 text not null,
  rows_read int not null,
  rows_imported int not null,
  actor text not null,
  created_at timestamptz not null default now()
);

create table activity (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor text not null,
  command text not null,
  record_id text,
  detail text
);

create trigger sites_touch before update on sites for each row execute function touch_updated_at();
create trigger consents_touch before update on consents for each row execute function touch_updated_at();
create trigger conditions_touch before update on conditions for each row execute function touch_updated_at();
create trigger points_touch before update on points for each row execute function touch_updated_at();
create trigger incidents_touch before update on incidents for each row execute function touch_updated_at();
create trigger inspections_touch before update on inspections for each row execute function touch_updated_at();
create trigger notices_touch before update on notices for each row execute function touch_updated_at();
create trigger plans_touch before update on plans for each row execute function touch_updated_at();
create trigger complaints_touch before update on complaints for each row execute function touch_updated_at();

-- The activity log is append-only.
create or replace function activity_append_only() returns trigger language plpgsql as $$
begin raise exception 'activity is append-only'; end $$;
create trigger activity_no_update before update or delete on activity for each row execute function activity_append_only();

-- A reading or a piece of evidence is never edited or deleted. A wrong one is
-- answered with a correcting record and a note, so an auditor sees both.
create or replace function record_locked() returns trigger language plpgsql as $$
begin raise exception 'readings and evidence are never changed: record the correction as a new entry with a note'; end $$;
create trigger readings_no_update before update or delete on readings for each row execute function record_locked();
create trigger evidence_no_update before update or delete on evidence for each row execute function record_locked();

-- ------------------------------------------------------------------ views

-- Every consent with its dates worked out. RMA s124: apply for the new consent
-- at least six months before expiry to keep operating while it is decided.
create view consent_register as
select c.id, c.code, s.code as site, s.country, s.regulator, c.authority_ref, c.kind, c.activity, c.holder,
  c.granted_on, c.commenced_on, coalesce(c.lapse_on, (c.granted_on + interval '5 years')::date) as lapse_on,
  c.expires_on, (c.expires_on - interval '6 months')::date as renew_by,
  c.renewal_lodged_on, c.renewal_ref, c.status,
  c.expires_on - current_date as days_to_expiry,
  case when c.expires_on is null then null else (c.expires_on - interval '6 months')::date - current_date end as days_to_renew_by
from consents c join sites s on s.id = c.site_id;

-- Each active condition's next due date: once (first_due until evidence exists)
-- or recurring (last evidence + every_days, or first_due).
create view condition_due as
select co.id as condition_id, co.code, s.code as site, c.code as consent, co.number, co.kind, co.summary, co.owner, co.every_days,
  e.last_done,
  case when co.every_days is null then case when e.last_done is null then co.first_due end
       else coalesce((e.last_done + co.every_days), co.first_due) end as next_due,
  greatest(current_date - case when co.every_days is null then case when e.last_done is null then co.first_due end
       else coalesce((e.last_done + co.every_days), co.first_due) end, 0) as days_overdue
from conditions co
join consents c on c.id = co.consent_id and c.status = 'active'
join sites s on s.id = c.site_id
left join lateral (select max(done_on) as last_done from evidence ev where ev.condition_id = co.id) e on true
where co.active;

-- Every reading against the consent limit for that point and parameter.
-- A '<' reading never counts as over a maximum.
create view reading_check as
select r.id as reading_id, s.code as site, s.country, p.code as point, p.kind as point_kind, r.taken_on, r.parameter, r.qualifier, r.value, r.unit,
  l.min_value, l.max_value, l.basis, co.code as condition, c.code as consent,
  case when l.id is null then 'no limit'
       when l.max_value is not null and r.value > l.max_value and r.qualifier <> '<' then 'over limit'
       when l.min_value is not null and r.value < l.min_value and r.qualifier <> '>' then 'under minimum'
       else 'ok' end as verdict,
  exists (select 1 from incidents i where i.reading_id = r.id) as has_incident
from readings r
join points p on p.id = r.point_id
join sites s on s.id = p.site_id
left join limits l on l.point_id = r.point_id and l.parameter = r.parameter
left join conditions co on co.id = l.condition_id
left join consents c on c.id = co.consent_id;

create view incident_register as
select i.id, i.code, s.code as site, s.country, s.regulator, c.code as consent, co.code as condition, i.kind, i.found_on, i.description,
  coalesce(co.notify_within_days, case when s.country = 'AU' then 0 else 1 end) as notify_within_days,
  i.found_on + coalesce(co.notify_within_days, case when s.country = 'AU' then 0 else 1 end) as notify_by,
  i.notified_on, i.notified_on - i.found_on as days_to_notify, i.regulator_ref, i.corrective_action, i.closed_on,
  case when i.closed_on is null then 'open' else 'closed' end as status,
  coalesce(i.closed_on, current_date) - i.found_on as days_open
from incidents i join consents c on c.id = i.consent_id join sites s on s.id = c.site_id
left join conditions co on co.id = i.condition_id;

-- Water meters on takes of 5 L/s or more: the last 30 days of daily volume,
-- days with no record, and the meter's verification date.
create view water_take as
select s.code as site, p.code as point, p.name, p.max_rate_ls, p.meter_verified_on,
  (p.meter_verified_on + interval '5 years')::date as verify_by,
  (select max(r.taken_on) from readings r where r.point_id = p.id and r.parameter = 'VOLUME') as last_record,
  (select count(distinct r.taken_on) from readings r where r.point_id = p.id and r.parameter = 'VOLUME' and r.taken_on between current_date - 30 and current_date - 1)::int as days_recorded_30d,
  30 - (select count(distinct r.taken_on) from readings r where r.point_id = p.id and r.parameter = 'VOLUME' and r.taken_on between current_date - 30 and current_date - 1)::int as days_missing_30d,
  (select round(sum(r.value)) from readings r where r.point_id = p.id and r.parameter = 'VOLUME' and r.taken_on >= current_date - 30)::float as m3_30d,
  (select l.max_value from limits l where l.point_id = p.id and l.parameter = 'VOLUME')::float as max_m3_day,
  (select count(*) from reading_check rc where rc.point = p.code and rc.parameter = 'VOLUME' and rc.verdict = 'over limit' and rc.taken_on >= current_date - 30)::int as days_over_30d
from points p join sites s on s.id = p.site_id
where p.kind = 'water_meter' and p.active and coalesce(p.max_rate_ls, 0) >= 5;

-- What needs a person, worst first. Severity 1: a legal duty or the right to operate.
create view site_attention as
select 1 as severity, site, point || ' ' || parameter || ' ' || taken_on as item, 'breach with no incident' as rule,
  case when qualifier = '=' then '' else qualifier end || value || ' ' || unit || ' against ' || coalesce('max ' || max_value, 'min ' || min_value) || ' (' || condition || ')' as detail,
  current_date - taken_on as days
from reading_check where verdict in ('over limit','under minimum') and not has_incident
union all
select 1, site, code, 'regulator not told', kind || ' found ' || found_on || ', ' || regulator || ' to be told by ' || notify_by, current_date - notify_by
from incident_register where notified_on is null and status = 'open' and notify_by < current_date
union all
select 1, s.code, n.code, 'notice deadline', n.kind || ' notice ' || n.reference || ': ' || n.requirement || ', by ' || n.comply_by, current_date - n.comply_by
from notices n join sites s on s.id = n.site_id where n.complied_on is null and n.comply_by <= current_date + 14
union all
select 1, site, code, 'renewal window missed', 'expires ' || expires_on || ', renew-by date ' || renew_by || ' passed with no application', current_date - renew_by
from consent_register where status = 'active' and expires_on >= current_date and renew_by < current_date and renewal_lodged_on is null
union all
select 1, site, code, 'consent expired', 'expired ' || expires_on || ' and still marked active', current_date - expires_on
from consent_register where status = 'active' and expires_on < current_date and renewal_lodged_on is null
union all
select 2, site, consent || ' cond ' || number, 'condition overdue', summary || coalesce(' (' || owner || ')', ''), days_overdue
from condition_due where next_due < current_date
union all
select 2, site, consent || ' cond ' || number, 'due within 14 days', summary || ', due ' || next_due || coalesce(' (' || owner || ')', ''), current_date - next_due
from condition_due where next_due between current_date and current_date + 14
union all
select 2, site, code, 'renewal due soon', 'lodge the new application by ' || renew_by || ' (expires ' || expires_on || ')', current_date - renew_by
from consent_register where status = 'active' and renewal_lodged_on is null and renew_by between current_date and current_date + 120
union all
select 2, site, code, 'lapse date close', 'not given effect yet; lapses ' || lapse_on, current_date - lapse_on
from consent_register where status = 'active' and commenced_on is null and lapse_on <= current_date + 180
union all
select 2, site, point, 'water records missing', days_missing_30d || ' of the last 30 days have no daily volume (last ' || coalesce(last_record::text, 'never') || ')', days_missing_30d
from water_take where days_missing_30d > 0
union all
select 2, site, point, 'meter verification due', case when meter_verified_on is null then 'no verification recorded' else 'verified ' || meter_verified_on || ', due by ' || verify_by end,
  case when verify_by is null then null else current_date - verify_by end
from water_take where meter_verified_on is null or verify_by < current_date + 60
union all
select 2, s.code, pl.code, case when pl.kind = 'pirmp' and (pl.last_tested_on is null or pl.last_tested_on < current_date - 365) then 'plan not tested' else 'plan review overdue' end,
  pl.name || ' v' || pl.version || case when pl.kind = 'pirmp' and (pl.last_tested_on is null or pl.last_tested_on < current_date - 365)
    then ', last tested ' || coalesce(pl.last_tested_on::text, 'never') else ', last reviewed ' || coalesce(pl.last_reviewed_on::text, 'never') end,
  current_date - coalesce(pl.last_tested_on, pl.last_reviewed_on)
from plans pl join sites s on s.id = pl.site_id
where (pl.last_reviewed_on is null or (pl.last_reviewed_on + make_interval(months => pl.review_every_months))::date < current_date)
   or (pl.kind = 'pirmp' and (pl.last_tested_on is null or pl.last_tested_on < current_date - 365))
union all
select 2, s.code, ins.code, 'inspection actions overdue', ins.grade || ' grade on ' || ins.inspected_on || ': ' || coalesce(ins.findings, ''), current_date - ins.actions_due
from inspections ins join consents c on c.id = ins.consent_id join sites s on s.id = c.site_id
where ins.actions_due < current_date and ins.actions_done_on is null
union all
select 3, s.code, cp.code, 'complaint not answered', cp.kind || coalesce(' at ' || cp.location, '') || ' since ' || cp.received_on, current_date - cp.received_on
from complaints cp join sites s on s.id = cp.site_id where cp.responded_on is null and cp.closed_on is null and cp.received_on < current_date - 2
union all
select 3, site, code, 'incident not closed', kind || ' open ' || days_open || ' days', days_open
from incident_register where status = 'open' and days_open > 30;

alter table sites enable row level security;
alter table consents enable row level security;
alter table conditions enable row level security;
alter table evidence enable row level security;
alter table points enable row level security;
alter table limits enable row level security;
alter table readings enable row level security;
alter table incidents enable row level security;
alter table inspections enable row level security;
alter table notices enable row level security;
alter table plans enable row level security;
alter table complaints enable row level security;
alter table imports enable row level security;
alter table activity enable row level security;
